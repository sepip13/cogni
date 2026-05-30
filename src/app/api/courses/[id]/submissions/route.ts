import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseFile } from "@/lib/parse-file";
import { saveSubmissionFile, isAllowedUpload, MAX_FILE_BYTES } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

const MAX_TITLE_CHARS = 200;
const MAX_PASTE_CHARS = 200_000;
const UPLOAD_LIMIT = { max: 20, windowMs: 5 * 60 * 1000 }; // 20 / 5min / user

const SUBMISSION_KINDS = [
  "ASSIGNMENT",
  "PROJECT",
  "PORTFOLIO",
  "ESSAY",
  "REPORT",
  "OTHER",
] as const;
type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

type Params = { params: Promise<{ id: string }> };

async function requireOwnedCourse(courseId: string, userId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true },
  });
  return course && course.userId === userId ? course : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!(await requireOwnedCourse(courseId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const submissions = await prisma.submission.findMany({
    where: { courseId, userId: session.user.id },
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      fileName: true,
      updatedAt: true,
      reviews: {
        select: { scoreOutOf10: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const list = submissions.map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    status: s.status,
    fileName: s.fileName,
    latestScore: s.reviews[0]?.scoreOutOf10 ?? null,
    updatedAt: s.updatedAt,
  }));

  return NextResponse.json({ submissions: list });
}

function parseKind(raw: string | null): SubmissionKind | null {
  if (!raw) return "ASSIGNMENT";
  return (SUBMISSION_KINDS as readonly string[]).includes(raw)
    ? (raw as SubmissionKind)
    : null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: courseId } = await params;
  if (!(await requireOwnedCourse(courseId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limit = rateLimit(`submit:${userId}`, UPLOAD_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (title.length > MAX_TITLE_CHARS) {
    return NextResponse.json({ error: "Title is too long." }, { status: 400 });
  }

  const kind = parseKind(formData.get("kind") as string | null);
  if (!kind) {
    return NextResponse.json({ error: "Invalid submission type." }, { status: 400 });
  }

  const pasteText = ((formData.get("pasteText") as string | null) ?? "")
    .slice(0, MAX_PASTE_CHARS)
    .trim();
  const file = formData.get("file") as File | null;

  if (!file && !pasteText) {
    return NextResponse.json(
      { error: "Attach a file or paste the text of your work." },
      { status: 400 }
    );
  }

  // Validate + read file buffer NOW, before the response/after() — the request
  // stream is gone once after() runs.
  let filePayload: { name: string; type: string; buffer: Buffer } | null = null;
  if (file && file.size > 0) {
    const type = file.type || "application/octet-stream";
    if (!isAllowedUpload(file.name, type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, Word, PowerPoint, or text." },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 20 MB limit." },
        { status: 400 }
      );
    }
    filePayload = {
      name: file.name,
      type,
      buffer: Buffer.from(await file.arrayBuffer()),
    };
  }

  const submission = await prisma.submission.create({
    data: {
      courseId,
      userId,
      title,
      kind,
      status: "IN_PROGRESS",
      fileName: filePayload?.name ?? null,
      fileType: filePayload?.type ?? null,
      // Paste-only work is ready to review immediately; file work is filled in below.
      parsedText: filePayload ? null : pasteText,
    },
  });

  if (filePayload) {
    const payload = filePayload;
    after(async () => {
      await ingestSubmissionFile(submission.id, courseId, payload, pasteText);
    });
  }

  return NextResponse.json({ submissionId: submission.id }, { status: 201 });
}

async function ingestSubmissionFile(
  submissionId: string,
  courseId: string,
  file: { name: string; type: string; buffer: Buffer },
  pasteText: string
): Promise<void> {
  let blobUrl: string | null = null;
  let parsedText = "";
  let pageCount: number | null = null;

  try {
    const saved = await saveSubmissionFile(courseId, file.name, file.buffer);
    blobUrl = saved.url;
  } catch (err) {
    console.error(`[submission:${submissionId}] file save error:`, err instanceof Error ? err.message : err);
  }

  try {
    const result = await parseFile(file.buffer, file.type);
    parsedText = result.text;
    pageCount = result.pageCount;
  } catch (err) {
    console.error(`[submission:${submissionId}] parse error:`, err instanceof Error ? err.message : err);
  }

  // Combine extracted file text with any pasted notes, without touching course rawText.
  const combined = [parsedText, pasteText].filter(Boolean).join("\n\n---\n\n");

  await prisma.submission
    .update({
      where: { id: submissionId },
      data: { blobUrl, parsedText: combined, pageCount },
    })
    .catch((err) => {
      console.error(`[submission:${submissionId}] update error:`, err instanceof Error ? err.message : err);
    });
}

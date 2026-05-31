import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseFile } from "@/lib/parse-file";
import { saveCourseFile, isAllowedUpload, MAX_FILE_BYTES } from "@/lib/uploads";
import { resolveLargeContextModel } from "@/lib/freellm";
import { splitTrialQuestions } from "@/lib/exam";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { userHasJobCapacity } from "@/lib/concurrency";

export const maxDuration = 300;

const MAX_TITLE_CHARS = 200;
const MAX_PASTE_CHARS = 100_000;
const UPLOAD_LIMIT = { max: 15, windowMs: 10 * 60 * 1000 };

type Params = { params: Promise<{ id: string }> };

async function requireOwnedCourse(courseId: string, userId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { userId: true } });
  return !!course && course.userId === userId;
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

  const trials = await prisma.examTrial.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      fileName: true,
      questions: true,
      error: true,
      createdAt: true,
      mockExams: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, questions: true, error: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({ trials });
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

  const limit = rateLimit(`examtrial:${userId}`, UPLOAD_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  if (!(await userHasJobCapacity(userId))) {
    return NextResponse.json(
      { error: "You have several tasks still processing. Please wait for them to finish, then try again." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const title = (formData.get("title") as string | null)?.trim() || "Trial exam";
  if (title.length > MAX_TITLE_CHARS) {
    return NextResponse.json({ error: "Title is too long." }, { status: 400 });
  }
  const pasteText = ((formData.get("pasteText") as string | null) ?? "").slice(0, MAX_PASTE_CHARS).trim();
  const file = formData.get("file") as File | null;

  if (!file && !pasteText) {
    return NextResponse.json({ error: "Attach the exam file or paste its text." }, { status: 400 });
  }

  let filePayload: { name: string; type: string; buffer: Buffer } | null = null;
  if (file && file.size > 0) {
    const type = file.type || "application/octet-stream";
    if (!isAllowedUpload(file.name, type)) {
      return NextResponse.json({ error: "Unsupported file type. Use PDF, Word, Excel, or text." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File exceeds the 20 MB limit." }, { status: 400 });
    }
    filePayload = { name: file.name, type, buffer: Buffer.from(await file.arrayBuffer()) };
  }

  const model = resolveLargeContextModel(await isProUser(userId));

  const trial = await prisma.examTrial.create({
    data: {
      courseId,
      userId,
      title,
      status: "PARSING",
      fileName: filePayload?.name ?? null,
      fileType: filePayload?.type ?? null,
      parsedText: filePayload ? null : pasteText,
    },
  });

  after(async () => {
    if (filePayload) {
      let blobUrl: string | null = null;
      let parsedText = "";
      try {
        const saved = await saveCourseFile(courseId, "exams", filePayload.name, filePayload.buffer);
        blobUrl = saved.url;
      } catch (err) {
        console.error(`[exam-trial:${trial.id}] save error:`, err instanceof Error ? err.message : err);
      }
      try {
        const result = await parseFile(filePayload.buffer, filePayload.type);
        parsedText = result.text;
      } catch (err) {
        console.error(`[exam-trial:${trial.id}] parse error:`, err instanceof Error ? err.message : err);
      }
      const combined = [parsedText, pasteText].filter(Boolean).join("\n\n");
      await prisma.examTrial
        .update({ where: { id: trial.id }, data: { blobUrl, parsedText: combined } })
        .catch(() => {});
    }
    await splitTrialQuestions(trial.id, model);
  });

  return NextResponse.json({ trialId: trial.id }, { status: 201 });
}

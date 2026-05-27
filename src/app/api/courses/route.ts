import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parseFile } from "@/lib/parse-file";
import { ingestCourse } from "@/lib/ingestion";

export const maxDuration = 300;

const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file
const DAILY_COURSE_LIMIT = 3;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "text/plain",
]);

function getUploadDir(): string {
  return (
    process.env.UPLOAD_DIR ??
    path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads")
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courses = await prisma.course.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      code: true,
      examDate: true,
      status: true,
      totalPrepTimeMinutes: true,
      createdAt: true,
      updatedAt: true,
      topics: {
        select: { id: true, studied: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(courses);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Fetch user plan
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const userPlan = dbUser?.plan ?? "FREE";

  // Rate limit: max 3 courses per user per day
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayCount = await prisma.course.count({
    where: { userId, createdAt: { gte: startOfDay } },
  });

  if (todayCount >= DAILY_COURSE_LIMIT) {
    return NextResponse.json(
      {
        error: `You can create up to ${DAILY_COURSE_LIMIT} courses per day. Try again tomorrow.`,
      },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const name = (formData.get("name") as string | null)?.trim() || "Untitled Course";

  const examDateRaw = formData.get("examDate") as string | null;
  let examDate: Date | null = null;
  if (examDateRaw) {
    const parsed = new Date(examDateRaw);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid exam date" }, { status: 400 });
    }
    examDate = parsed;
  }

  // modelChoice is the FreeLLM model ID (e.g. "gemini-2.5-flash", "auto") for FREE users,
  // or a Claude tier ID ("haiku" | "sonnet" | "opus") for PRO users.
  // Keep "free" sentinel for backward compat → map to "auto".
  const rawModel = (formData.get("model") as string | null) ?? "auto";
  const modelChoice = rawModel === "free" ? "auto" : rawModel;
  const pasteText = (formData.get("pasteText") as string | null)?.trim() ?? "";
  const files = formData.getAll("files") as File[];

  if (files.length === 0 && !pasteText) {
    return NextResponse.json(
      { error: "Upload at least one file or paste your course material." },
      { status: 400 }
    );
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} files allowed.` },
      { status: 400 }
    );
  }

  // Read file buffers NOW, before the response is sent.
  // File objects from formData are backed by the request stream — they become
  // unreadable once after() fires and the request is cleaned up.
  const fileBuffers: { name: string; type: string; buffer: Buffer }[] = [];
  for (const file of files) {
    fileBuffers.push({
      name: file.name,
      type: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  }

  // Create the Course row immediately so client can redirect
  const course = await prisma.course.create({
    data: {
      userId,
      name,
      examDate,
      status: "PROCESSING",
    },
  });

  // Process files + pasted text after response is sent (Next.js keeps the work alive)
  after(async () => {
    try {
      await processCourseMaterials(course.id, fileBuffers, pasteText, modelChoice, userPlan);
    } catch (err) {
      console.error(`[course:${course.id}] background processing error:`, err);
      await prisma.course
        .update({
          where: { id: course.id },
          data: { status: "FAILED" },
        })
        .catch(() => {});
    }
  });

  return NextResponse.json({ courseId: course.id }, { status: 202 });
}

async function saveFileLocally(
  courseId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const uploadDir = getUploadDir();
  const courseDir = path.join(uploadDir, "courses", courseId);
  await mkdir(courseDir, { recursive: true });

  // Sanitize file name to prevent path traversal
  const safeName = path.basename(fileName);
  await writeFile(path.join(courseDir, safeName), buffer);

  return `/api/files/courses/${courseId}/${encodeURIComponent(safeName)}`;
}

async function processCourseMaterials(
  courseId: string,
  files: { name: string; type: string; buffer: Buffer }[],
  pasteText: string,
  modelChoice: string,
  userPlan: "FREE" | "PRO" = "FREE"
) {
  console.log(`[course:${courseId}] ▶ processCourseMaterials START — files=${files.length} pasteText=${pasteText.length}chars model=${modelChoice}`);

  const sourceFileDatas: {
    fileName: string;
    fileType: string;
    blobUrl: string;
    parsedText: string;
    pageCount: number | null;
  }[] = [];

  for (const file of files) {
    console.log(`[course:${courseId}]   file: name="${file.name}" type="${file.type}" size=${file.buffer.length}bytes`);

    if (!ALLOWED_TYPES.has(file.type) && !isAllowedByExtension(file.name)) {
      console.warn(`[course:${courseId}]   ⚠ SKIPPED — type not allowed: "${file.type}"`);
      continue;
    }

    if (file.buffer.length > MAX_FILE_BYTES) {
      console.warn(`[course:${courseId}]   ⚠ SKIPPED — file too large: ${file.buffer.length} > ${MAX_FILE_BYTES}`);
      continue;
    }

    let fileUrl = "";
    try {
      fileUrl = await saveFileLocally(courseId, file.name, file.buffer);
      console.log(`[course:${courseId}]   ✓ saved → ${fileUrl}`);
    } catch (err) {
      console.error(`[course:${courseId}]   ✗ file save error for "${file.name}":`, err instanceof Error ? err.message : err);
    }

    let parsedText = "";
    let pageCount: number | null = null;
    try {
      console.log(`[course:${courseId}]   ▶ parsing "${file.name}"...`);
      const result = await parseFile(file.buffer, file.type);
      parsedText = result.text;
      pageCount = result.pageCount;
      console.log(`[course:${courseId}]   ✓ parsed "${file.name}" — ${parsedText.length} chars, pages=${pageCount}`);
    } catch (err) {
      console.error(`[course:${courseId}]   ✗ parse error for "${file.name}":`, err instanceof Error ? err.message : err);
    }

    sourceFileDatas.push({
      fileName: file.name,
      fileType: file.type,
      blobUrl: fileUrl,
      parsedText,
      pageCount,
    });
  }

  console.log(`[course:${courseId}] ▶ Writing ${sourceFileDatas.length} SourceFile rows to DB...`);
  await prisma.sourceFile.createMany({
    data: sourceFileDatas.map((d) => ({ courseId, ...d })),
  });

  // Combine all parsed text + paste text into rawText
  const allText = [
    ...sourceFileDatas.map((d) => d.parsedText),
    pasteText,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  console.log(`[course:${courseId}] ✓ rawText combined — total ${allText.length} chars`);

  await prisma.course.update({
    where: { id: courseId },
    data: { rawText: allText },
  });

  // Kick off LLM ingestion now that raw text is ready
  console.log(`[course:${courseId}] ▶ Handing off to ingestCourse (plan=${userPlan})...`);
  await ingestCourse(courseId, modelChoice, userPlan);
  console.log(`[course:${courseId}] ✓ processCourseMaterials DONE`);
}

function isAllowedByExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["pdf", "doc", "docx", "ppt", "pptx", "txt"].includes(ext ?? "");
}

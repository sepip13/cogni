import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parseFile } from "@/lib/parse-file";
import { ingestCourse } from "@/lib/ingestion";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file
const DAILY_COURSE_LIMIT = 3;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-powerpoint",
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

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    return NextResponse.json({ error: "Course name is required" }, { status: 400 });
  }

  const examDateRaw = formData.get("examDate") as string | null;
  const examDate = examDateRaw ? new Date(examDateRaw) : null;

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

  // Create the Course row immediately so client can redirect
  const course = await prisma.course.create({
    data: {
      userId,
      name,
      examDate,
      status: "PROCESSING",
    },
  });

  // Process files + pasted text in background (non-blocking response)
  processCourseMaterials(course.id, files, pasteText).catch((err) => {
    console.error(`[course:${course.id}] background processing error:`, err);
    prisma.course
      .update({
        where: { id: course.id },
        data: { status: "FAILED" },
      })
      .catch(() => {});
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
  files: File[],
  pasteText: string
) {
  const sourceFileDatas: {
    fileName: string;
    fileType: string;
    blobUrl: string;
    parsedText: string;
    pageCount: number | null;
  }[] = [];

  for (const file of files) {
    // Validate file type
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(mimeType) && !isAllowedByExtension(file.name)) {
      continue; // skip unknown types silently (already validated client-side)
    }

    if (file.size > MAX_FILE_BYTES) {
      continue; // skip oversized files
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Save to local disk
    let fileUrl = "";
    try {
      fileUrl = await saveFileLocally(courseId, file.name, buffer);
    } catch (err) {
      console.error(`[course:${courseId}] file save error for ${file.name}:`, err);
    }

    // Parse text server-side
    let parsedText = "";
    let pageCount: number | null = null;
    try {
      const result = await parseFile(buffer, mimeType);
      parsedText = result.text;
      pageCount = result.pageCount;
    } catch (err) {
      console.error(`[course:${courseId}] parse error for ${file.name}:`, err);
    }

    sourceFileDatas.push({
      fileName: file.name,
      fileType: mimeType,
      blobUrl: fileUrl,
      parsedText,
      pageCount,
    });
  }

  // Write all SourceFile rows
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

  await prisma.course.update({
    where: { id: courseId },
    data: { rawText: allText },
  });

  // Kick off LLM ingestion now that raw text is ready
  await ingestCourse(courseId);
}

function isAllowedByExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["pdf", "docx", "pptx"].includes(ext ?? "");
}

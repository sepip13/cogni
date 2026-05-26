import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; topicId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, topicId } = await params;

  // Verify course ownership
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      userId: true,
      id: true,
      name: true,
      files: {
        select: { id: true, fileName: true, fileType: true, blobUrl: true, pageCount: true },
      },
    },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      num: true,
      title: true,
      priority: true,
      priorityLabel: true,
      why: true,
      timeMinutes: true,
      pages: true,
      subtopics: true,
      practiceQuestions: true,
      sources: true,
      studied: true,
      order: true,
      courseId: true,
    },
  });

  if (!topic || topic.courseId !== courseId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ topic, sourceFiles: course.files, courseName: course.name });
}

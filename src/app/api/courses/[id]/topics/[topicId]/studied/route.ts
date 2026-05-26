import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; topicId: string }> };

export async function PATCH(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, topicId } = await params;

  // Verify course ownership
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { courseId: true, studied: true },
  });

  if (!topic || topic.courseId !== courseId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Toggle the studied flag
  const updated = await prisma.topic.update({
    where: { id: topicId },
    data: { studied: !topic.studied },
    select: { studied: true },
  });

  return NextResponse.json({ studied: updated.studied });
}

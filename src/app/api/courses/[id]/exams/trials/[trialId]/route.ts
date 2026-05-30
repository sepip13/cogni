import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; trialId: string }> };

async function loadOwnedTrial(courseId: string, trialId: string, userId: string) {
  const trial = await prisma.examTrial.findUnique({
    where: { id: trialId },
    select: {
      id: true,
      courseId: true,
      userId: true,
      title: true,
      status: true,
      fileName: true,
      questions: true,
      error: true,
      createdAt: true,
      course: { select: { userId: true } },
      mockExams: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, questions: true, error: true, createdAt: true },
      },
    },
  });
  if (!trial || trial.courseId !== courseId || trial.userId !== userId || trial.course.userId !== userId) {
    return null;
  }
  return trial;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId, trialId } = await params;
  const trial = await loadOwnedTrial(courseId, trialId, session.user.id);
  if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ trial });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId, trialId } = await params;
  const trial = await loadOwnedTrial(courseId, trialId, session.user.id);
  if (!trial) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.examTrial.delete({ where: { id: trialId } });
  return NextResponse.json({ deleted: true });
}

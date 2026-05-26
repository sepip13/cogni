import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      code: true,
      examDate: true,
      status: true,
      totalPrepTimeMinutes: true,
      createdAt: true,
      updatedAt: true,
      topics: {
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
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(course);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.course.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}

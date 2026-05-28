import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courses = await prisma.course.findMany({
    where: { status: "READY" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
      topics: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          num: true,
          title: true,
          priority: true,
          practiceQuestions: true,
        },
      },
    },
  });

  const attempts = await prisma.practiceAttempt.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      topicId: true,
      userId: true,
      questionIndex: true,
      userAnswer: true,
      score: true,
      verdict: true,
      feedback: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ courses, attempts });
}

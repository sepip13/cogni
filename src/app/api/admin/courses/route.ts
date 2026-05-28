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
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true,
      educationLevel: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      totalPrepTimeMinutes: true,
      _count: { select: { topics: true, files: true, chatMessages: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json(courses);
}

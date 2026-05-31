import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Cross-course "what's due" feed for the dashboard banner. Returns the user's
 * deliverables that have a due date, are not yet graded, and fall within the
 * overdue→two-week window — sorted soonest-first. In-app only (no email/push).
 */

const WINDOW_DAYS = 14;
const MAX_ITEMS = 8;

function daysUntil(due: Date): number {
  return Math.ceil((due.getTime() - Date.now()) / 86_400_000);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.courseDeliverable.findMany({
    where: { dueDate: { not: null }, course: { userId: session.user.id } },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      title: true,
      weight: true,
      dueDate: true,
      courseId: true,
      course: { select: { name: true } },
      submissions: { select: { reviews: { select: { id: true }, take: 1 } } },
    },
  });

  const items = rows
    .filter((d) => !d.submissions.some((s) => s.reviews.length > 0)) // exclude graded
    .map((d) => ({
      id: d.id,
      title: d.title,
      courseId: d.courseId,
      courseName: d.course.name,
      weight: d.weight,
      dueDate: d.dueDate as Date,
      daysUntilDue: daysUntil(d.dueDate as Date),
    }))
    .filter((d) => d.daysUntilDue <= WINDOW_DAYS)
    .slice(0, MAX_ITEMS);

  return NextResponse.json({ items });
}

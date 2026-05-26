import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export interface CalendarDay {
  date: string;         // YYYY-MM-DD
  dayLabel: string;     // "Mon 26 May"
  isToday: boolean;
  topics: Array<{
    id: string;
    num: string;
    title: string;
    priority: "HIGH" | "MED" | "LOW";
    timeMinutes: number;
    studied: boolean;
  }>;
  totalMinutes: number;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      userId: true,
      examDate: true,
      topics: {
        select: { id: true, num: true, title: true, priority: true, timeMinutes: true, studied: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const today = startOfDay(new Date());
  const exam = course.examDate ? startOfDay(new Date(course.examDate)) : null;

  // Build day array from today to exam (inclusive), capped at 60 days
  const days = buildDayRange(today, exam);

  // Sort topics: HIGH first, then MED, then LOW; within tier by order
  const tierOrder = { HIGH: 0, MED: 1, LOW: 2 } as const;
  const sortedTopics = [...course.topics].sort((a, b) => {
    const tierDiff = tierOrder[a.priority] - tierOrder[b.priority];
    return tierDiff !== 0 ? tierDiff : a.order - b.order;
  });

  // Distribute topics across days, aiming for ~90 minutes / day
  const TARGET_MINUTES_PER_DAY = 90;
  const calendar = distributeTopics(sortedTopics, days, TARGET_MINUTES_PER_DAY);

  return NextResponse.json({ calendar, examDate: course.examDate });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildDayRange(from: Date, to: Date | null): Date[] {
  const result: Date[] = [];
  const limit = to ? Math.min(diffDays(from, to) + 1, 60) : 14;
  for (let i = 0; i < limit; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    result.push(d);
  }
  return result;
}

function diffDays(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function distributeTopics(
  topics: Array<{ id: string; num: string; title: string; priority: "HIGH" | "MED" | "LOW"; timeMinutes: number; studied: boolean }>,
  days: Date[],
  targetPerDay: number
): CalendarDay[] {
  const today = startOfDay(new Date());
  const result: CalendarDay[] = days.map((d) => ({
    date: formatDate(d),
    dayLabel: formatLabel(d),
    isToday: d.getTime() === today.getTime(),
    topics: [],
    totalMinutes: 0,
  }));

  let dayIndex = 0;

  for (const topic of topics) {
    if (dayIndex >= result.length) break;

    // If adding this topic would go too far over target AND there's a next day, advance
    const day = result[dayIndex];
    if (
      day.totalMinutes > 0 &&
      day.totalMinutes + topic.timeMinutes > targetPerDay * 1.5 &&
      dayIndex + 1 < result.length
    ) {
      dayIndex++;
    }

    result[dayIndex].topics.push(topic);
    result[dayIndex].totalMinutes += topic.timeMinutes;

    // Advance day when we've hit the target
    if (result[dayIndex].totalMinutes >= targetPerDay && dayIndex + 1 < result.length) {
      dayIndex++;
    }
  }

  return result;
}

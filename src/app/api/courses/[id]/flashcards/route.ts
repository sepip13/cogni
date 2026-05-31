import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scheduleNext, type FlashcardRating } from "@/lib/srs";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const REVIEW_LIMIT = { max: 300, windowMs: 10 * 60 * 1000 };
const MAX_CARDS = 300;
const RATINGS: readonly FlashcardRating[] = ["again", "hard", "good", "easy"];

type Params = { params: Promise<{ id: string }> };

async function ownsCourse(courseId: string, userId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { userId: true } });
  return !!course && course.userId === userId;
}

// GET — the review queue (?due=1), an optional ?conceptKey= filter, and a counts
// summary { total, due, perConcept } that drives the due badge + map overlay.
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId } = await params;
  if (!(await ownsCourse(courseId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dueOnly = req.nextUrl.searchParams.get("due") === "1";
  const conceptKey = req.nextUrl.searchParams.get("conceptKey");
  const now = new Date();
  const baseWhere = { courseId, suspended: false };

  const [byConcept, dueByConcept] = await Promise.all([
    prisma.flashcard.groupBy({
      by: ["conceptKey"],
      where: baseWhere,
      _count: { _all: true },
      _sum: { lapses: true },
    }),
    prisma.flashcard.groupBy({
      by: ["conceptKey"],
      where: { ...baseWhere, dueAt: { lte: now } },
      _count: { _all: true },
    }),
  ]);

  const perConcept: Record<string, { total: number; due: number; lapses: number }> = {};
  let total = 0;
  for (const g of byConcept) {
    total += g._count._all;
    if (g.conceptKey) perConcept[g.conceptKey] = { total: g._count._all, due: 0, lapses: g._sum.lapses ?? 0 };
  }
  let due = 0;
  for (const g of dueByConcept) {
    due += g._count._all;
    if (g.conceptKey && perConcept[g.conceptKey]) perConcept[g.conceptKey].due = g._count._all;
  }

  // Cards only when a queue is actually requested — the bare counts call (badge /
  // overlay) stays cheap by returning an empty list.
  let cards: unknown[] = [];
  if (dueOnly || conceptKey) {
    cards = await prisma.flashcard.findMany({
      where: {
        courseId,
        suspended: false,
        ...(dueOnly ? { dueAt: { lte: now } } : {}),
        ...(conceptKey ? { conceptKey } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: MAX_CARDS,
      select: { id: true, conceptKey: true, front: true, back: true, kind: true, sourceRef: true, dueAt: true },
    });
  }

  return NextResponse.json({ cards, counts: { total, due, perConcept } });
}

// POST — record one review: apply SM-2 to the rated card and persist the schedule.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId } = await params;

  let body: { cardId?: unknown; rating?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const rating = body.rating as FlashcardRating;
  if (!cardId || !RATINGS.includes(rating)) {
    return NextResponse.json({ error: "A cardId and a valid rating are required." }, { status: 400 });
  }

  const limit = rateLimit(`flashcardreview:${userId}`, REVIEW_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Slow down a little." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const card = await prisma.flashcard.findUnique({
    where: { id: cardId },
    select: {
      courseId: true,
      reps: true,
      intervalDays: true,
      ease: true,
      lapses: true,
      course: { select: { userId: true } },
    },
  });
  if (!card || card.courseId !== courseId || card.course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const next = scheduleNext(
    { reps: card.reps, intervalDays: card.intervalDays, ease: card.ease, lapses: card.lapses },
    rating,
    new Date()
  );

  await prisma.flashcard.update({
    where: { id: cardId },
    data: {
      reps: next.reps,
      intervalDays: next.intervalDays,
      ease: next.ease,
      lapses: next.lapses,
      dueAt: next.dueAt,
      lastReviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, dueAt: next.dueAt });
}

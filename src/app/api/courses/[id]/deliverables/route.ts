import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const MANUAL_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 };
const DUE_SOON_DAYS = 7;
const MAX_TITLE_CHARS = 200;

const VALID_KINDS = [
  "ASSIGNMENT", "PROJECT", "PORTFOLIO", "ESSAY", "REPORT",
  "CASE_STUDY", "PRESENTATION", "REFLECTION", "OTHER",
] as const;
type DeliverableKind = (typeof VALID_KINDS)[number];

type Params = { params: Promise<{ id: string }> };

async function ownedCourse(courseId: string, userId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true, deliverablesStatus: true },
  });
  return course && course.userId === userId ? course : null;
}

interface LatestReview {
  scoreOutOf10: number;
  percentage: number | null;
  band: string | null;
}

/** Best percentage + its band across a deliverable's submissions' latest reviews. */
function bestOf(
  submissions: { reviews: LatestReview[] }[]
): { bestPercentage: number | null; band: string | null; hasReview: boolean } {
  let bestPercentage: number | null = null;
  let band: string | null = null;
  let hasReview = false;
  for (const sub of submissions) {
    const r = sub.reviews[0];
    if (!r) continue;
    hasReview = true;
    const pct = r.percentage ?? r.scoreOutOf10 * 10;
    if (bestPercentage === null || pct > bestPercentage) {
      bestPercentage = pct;
      band = r.band ?? null;
    }
  }
  return { bestPercentage, band, hasReview };
}

function daysUntil(due: Date | null): number | null {
  if (!due) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86_400_000);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId } = await params;
  const course = await ownedCourse(courseId, session.user.id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.courseDeliverable.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: {
      id: true, title: true, kind: true, status: true, source: true,
      weight: true, dueDate: true, format: true, unit: true, unitLimit: true,
      description: true, requirements: true, rubric: true, gradingScheme: true,
      sourceRef: true, confidence: true, order: true,
      submissions: {
        select: {
          id: true,
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { scoreOutOf10: true, percentage: true, band: true },
          },
        },
      },
    },
  });

  let dueSoon = 0;
  let overdue = 0;
  let graded = 0;

  const deliverables = rows.map((d) => {
    const { bestPercentage, band, hasReview } = bestOf(d.submissions);
    const submissionCount = d.submissions.length;
    const derivedStatus = hasReview
      ? "GRADED"
      : submissionCount > 0
      ? "SUBMITTED"
      : d.status;
    const days = daysUntil(d.dueDate);

    if (derivedStatus === "GRADED") graded++;
    else if (days != null && days < 0) overdue++;
    else if (days != null && days <= DUE_SOON_DAYS) dueSoon++;

    return {
      id: d.id,
      title: d.title,
      kind: d.kind,
      status: derivedStatus,
      storedStatus: d.status,
      source: d.source,
      weight: d.weight,
      dueDate: d.dueDate,
      format: d.format,
      unit: d.unit,
      unitLimit: d.unitLimit,
      description: d.description,
      requirements: d.requirements ?? [],
      rubric: d.rubric ?? [],
      gradingScheme: d.gradingScheme ?? null,
      sourceRef: d.sourceRef ?? null,
      confidence: d.confidence,
      order: d.order,
      submissionCount,
      bestPercentage,
      band,
      daysUntilDue: days,
    };
  });

  return NextResponse.json({
    deliverables,
    status: course.deliverablesStatus,
    counts: { total: deliverables.length, dueSoon, overdue, graded },
  });
}

function parseKind(raw: unknown): DeliverableKind {
  return typeof raw === "string" && (VALID_KINDS as readonly string[]).includes(raw)
    ? (raw as DeliverableKind)
    : "ASSIGNMENT";
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId } = await params;
  if (!(await ownedCourse(courseId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limit = rateLimit(`deliverables-add:${userId}`, MANUAL_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown; kind?: unknown; weight?: unknown; dueDate?: unknown;
    format?: unknown; description?: unknown;
  };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  if (title.length > MAX_TITLE_CHARS) {
    return NextResponse.json({ error: "Title is too long." }, { status: 400 });
  }

  const weight = typeof body.weight === "number" && body.weight >= 0 && body.weight <= 100 ? body.weight : null;
  const max = await prisma.courseDeliverable.aggregate({ where: { courseId }, _max: { order: true } });

  const created = await prisma.courseDeliverable.create({
    data: {
      courseId,
      title,
      kind: parseKind(body.kind),
      source: "MANUAL",
      status: "NOT_STARTED",
      weight,
      dueDate: parseDate(body.dueDate),
      format: typeof body.format === "string" ? body.format.trim() || null : null,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      requirements: [],
      rubric: [],
      order: (max._max.order ?? -1) + 1,
    },
    select: { id: true },
  });

  return NextResponse.json({ deliverableId: created.id }, { status: 201 });
}

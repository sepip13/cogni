import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const EDIT_LIMIT = { max: 60, windowMs: 5 * 60 * 1000 }; // 60 / 5min / user
const MAX_TITLE_CHARS = 200;
const VALID_STATUS = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "GRADED"] as const;
type DeliverableStatus = (typeof VALID_STATUS)[number];

type Params = { params: Promise<{ id: string; deliverableId: string }> };

async function ownedDeliverable(courseId: string, deliverableId: string, userId: string) {
  const d = await prisma.courseDeliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, courseId: true, course: { select: { userId: true } } },
  });
  if (!d || d.courseId !== courseId || d.course.userId !== userId) return null;
  return d;
}

function parseDate(raw: unknown): Date | null | undefined {
  if (raw === null) return null; // explicit clear
  if (typeof raw !== "string" || !raw.trim()) return undefined; // not provided
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId, deliverableId } = await params;

  const limit = rateLimit(`deliverables-edit:${userId}`, EDIT_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  if (!(await ownedDeliverable(courseId, deliverableId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: unknown; dueDate?: unknown; weight?: unknown; title?: unknown;
    linkSubmissionId?: unknown; unlinkSubmissionId?: unknown;
  };

  // Ambiguous intent — reject rather than silently picking one.
  if (typeof body.linkSubmissionId === "string" && typeof body.unlinkSubmissionId === "string") {
    return NextResponse.json(
      { error: "Send either linkSubmissionId or unlinkSubmissionId, not both." },
      { status: 400 }
    );
  }

  // ── Link / unlink a submission (owner-checked against this course) ──
  if (typeof body.linkSubmissionId === "string" || typeof body.unlinkSubmissionId === "string") {
    const subId = (body.linkSubmissionId ?? body.unlinkSubmissionId) as string;
    const sub = await prisma.submission.findUnique({
      where: { id: subId },
      select: { id: true, courseId: true, userId: true },
    });
    if (!sub || sub.courseId !== courseId || sub.userId !== userId) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }
    await prisma.submission.update({
      where: { id: subId },
      data: { deliverableId: typeof body.linkSubmissionId === "string" ? deliverableId : null },
    });
  }

  // ── Field edits ──
  const data: {
    status?: DeliverableStatus;
    dueDate?: Date | null;
    weight?: number | null;
    title?: string;
  } = {};

  if (typeof body.status === "string" && (VALID_STATUS as readonly string[]).includes(body.status)) {
    data.status = body.status as DeliverableStatus;
  }
  const due = parseDate(body.dueDate);
  if (due !== undefined) data.dueDate = due;
  if (body.weight === null) data.weight = null;
  else if (typeof body.weight === "number" && body.weight >= 0 && body.weight <= 100) data.weight = body.weight;
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    if (t.length > MAX_TITLE_CHARS) return NextResponse.json({ error: "Title is too long." }, { status: 400 });
    data.title = t;
  }

  if (Object.keys(data).length > 0) {
    await prisma.courseDeliverable.update({ where: { id: deliverableId }, data });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId, deliverableId } = await params;

  const limit = rateLimit(`deliverables-edit:${session.user.id}`, EDIT_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  if (!(await ownedDeliverable(courseId, deliverableId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.courseDeliverable.delete({ where: { id: deliverableId } });
  return NextResponse.json({ deleted: true });
}

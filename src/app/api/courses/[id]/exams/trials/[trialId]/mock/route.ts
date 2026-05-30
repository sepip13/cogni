import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { generateMockExam } from "@/lib/exam";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { userHasJobCapacity } from "@/lib/concurrency";

export const maxDuration = 120;

const MOCK_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };
const MIN_COUNT = 1;
const MAX_COUNT = 30;
const DEFAULT_COUNT = 8;

type Params = { params: Promise<{ id: string; trialId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId, trialId } = await params;

  const trial = await prisma.examTrial.findUnique({
    where: { id: trialId },
    select: { courseId: true, userId: true, status: true, course: { select: { userId: true } } },
  });
  if (!trial || trial.courseId !== courseId || trial.userId !== userId || trial.course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (trial.status !== "READY") {
    return NextResponse.json({ error: "This trial exam isn't ready yet." }, { status: 400 });
  }

  const limit = rateLimit(`mockexam:${userId}`, MOCK_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many practice exams generated. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  // Don't pile up duplicate generations for the same trial (double-click): if one
  // is already running, hand back its id so the client just polls that one.
  const existing = await prisma.mockExam.findFirst({
    where: { trialId, status: "GENERATING" },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ mockId: existing.id }, { status: 200 });
  }

  if (!(await userHasJobCapacity(userId))) {
    return NextResponse.json(
      { error: "You have several tasks still processing. Please wait for them to finish, then try again." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { count?: unknown; model?: unknown };
  const rawCount = typeof body.count === "number" ? Math.round(body.count) : DEFAULT_COUNT;
  const count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, rawCount));
  const requested = typeof body.model === "string" ? body.model : null;
  const model = resolveLargeContextModel(await isProUser(userId), requested);

  const mock = await prisma.mockExam.create({
    data: { courseId, trialId, title: "Practice exam", status: "GENERATING", questions: [] },
  });

  after(async () => {
    await generateMockExam(mock.id, model, count);
  });

  return NextResponse.json({ mockId: mock.id }, { status: 201 });
}

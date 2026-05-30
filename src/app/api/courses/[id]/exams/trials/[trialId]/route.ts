import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { splitTrialQuestions } from "@/lib/exam";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { userHasJobCapacity } from "@/lib/concurrency";

export const maxDuration = 300;

const RESPLIT_LIMIT = { max: 15, windowMs: 10 * 60 * 1000 };

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

// Re-run the split for a trial that failed (without re-uploading).
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId, trialId } = await params;

  const trial = await prisma.examTrial.findUnique({
    where: { id: trialId },
    select: { courseId: true, userId: true, parsedText: true, course: { select: { userId: true } } },
  });
  if (!trial || trial.courseId !== courseId || trial.userId !== userId || trial.course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(trial.parsedText ?? "").trim()) {
    return NextResponse.json({ error: "No readable content — please re-upload the exam." }, { status: 400 });
  }

  const limit = rateLimit(`resplit:${userId}`, RESPLIT_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Please wait a moment before trying again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  if (!(await userHasJobCapacity(userId))) {
    return NextResponse.json(
      { error: "You have several tasks still processing. Please wait for them to finish, then try again." },
      { status: 429 }
    );
  }

  const model = resolveLargeContextModel(await isProUser(userId));
  await prisma.examTrial.update({ where: { id: trialId }, data: { status: "PARSING", error: null } });
  after(async () => {
    await splitTrialQuestions(trialId, model);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

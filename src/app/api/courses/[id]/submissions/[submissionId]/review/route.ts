import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveModelForPlan } from "@/lib/freellm";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { gradeSubmission, GradeError } from "@/lib/grade-submission";

export const maxDuration = 120;

const REVIEW_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 }; // 30 / 10min / user

type Params = { params: Promise<{ id: string; submissionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: courseId, submissionId } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      parsedText: true,
      title: true,
      kind: true,
      course: { select: { userId: true, name: true, rawText: true } },
      deliverable: { select: { kind: true, rubric: true, gradingScheme: true } },
    },
  });

  if (
    !submission ||
    submission.courseId !== courseId ||
    submission.userId !== userId ||
    submission.course.userId !== userId
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(submission.parsedText ?? "").trim()) {
    return NextResponse.json(
      { error: "No readable content in this submission yet." },
      { status: 400 }
    );
  }

  const limit = rateLimit(`review:${userId}`, REVIEW_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many reviews requested. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  const requestedModel = typeof body.model === "string" ? body.model : null;
  const model = resolveModelForPlan(await isProUser(userId), requestedModel);

  try {
    const review = await gradeSubmission(
      {
        id: submission.id,
        title: submission.title,
        kind: submission.kind,
        parsedText: submission.parsedText,
      },
      {
        courseName: submission.course.name,
        rawText: submission.course.rawText ?? "",
        model,
        deliverable: submission.deliverable,
      }
    );
    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof GradeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "The review service is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMComplete } from "@/lib/freellm";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const maxDuration = 120;

const TEMPERATURE = 0.3;
const MAX_TOKENS = 2200;
const MAX_RUBRIC_CHARS = 60_000;
const MAX_WORK_CHARS = 40_000;
const REVIEW_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 }; // 30 / 10min / user

const ReviewSchema = z.object({
  score_out_of_10: z.number().min(0).max(10),
  rubric_breakdown: z.array(
    z.object({
      criterion: z.string(),
      scored: z.number(),
      max: z.number(),
      comment: z.string(),
    })
  ),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  action_items: z.array(z.string()),
  summary: z.string(),
});

function buildSystemPrompt(courseName: string): string {
  return `You are an examiner grading a student's submitted work against the course rubric for ${courseName}.
Score the work out of 10 (decimals allowed). Break the score down per rubric criterion you can identify in the course material. List concrete strengths, the specific gaps preventing a 10/10, and an ordered list of action items the student can follow to close those gaps and reach full marks.
Be specific and reference the rubric. If the course material contains no explicit rubric, infer reasonable criteria from the syllabus/learning objectives and say so in the summary.
Return JSON only:
{
  "score_out_of_10": number,
  "rubric_breakdown": [{ "criterion": string, "scored": number, "max": number, "comment": string }],
  "strengths": [string],
  "gaps": [string],
  "action_items": [string],
  "summary": string
}`;
}

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
      userId: true,
      courseId: true,
      parsedText: true,
      title: true,
      kind: true,
      course: { select: { userId: true, name: true, rawText: true } },
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

  const workText = (submission.parsedText ?? "").trim();
  if (!workText) {
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

  let model = "auto";
  try {
    const body = (await req.json().catch(() => ({}))) as { model?: unknown };
    if (typeof body.model === "string" && body.model.trim()) {
      model = body.model.trim();
    }
  } catch {
    /* no body — use default model */
  }

  const rubric = (submission.course.rawText ?? "").slice(0, MAX_RUBRIC_CHARS);
  const userMessage = `Course rubric / material:
<rubric>
${rubric || "(no course material provided)"}
</rubric>

Student work — "${submission.title}" (${submission.kind}):
<work>
${workText.slice(0, MAX_WORK_CHARS)}
</work>`;

  let raw: string;
  try {
    raw = await freeLLMComplete(
      [
        { role: "system", content: buildSystemPrompt(submission.course.name) },
        { role: "user", content: userMessage },
      ],
      { temperature: TEMPERATURE, jsonMode: true, model, maxTokens: MAX_TOKENS }
    );
  } catch (err) {
    const msg =
      err instanceof Error && err.message
        ? err.message
        : "The review service is temporarily unavailable. Please try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let review: z.infer<typeof ReviewSchema>;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    review = ReviewSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json(
      { error: "The review response was malformed. Please try again." },
      { status: 502 }
    );
  }

  const saved = await prisma.submissionReview.create({
    data: {
      submissionId,
      scoreOutOf10: review.score_out_of_10,
      rubricBreakdown: review.rubric_breakdown,
      strengths: review.strengths,
      gaps: review.gaps,
      actionItems: review.action_items,
      summary: review.summary,
      modelId: model,
    },
    select: {
      id: true,
      scoreOutOf10: true,
      rubricBreakdown: true,
      strengths: true,
      gaps: true,
      actionItems: true,
      summary: true,
      modelId: true,
      createdAt: true,
    },
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "REVIEWED" },
  });

  return NextResponse.json({ review: saved });
}

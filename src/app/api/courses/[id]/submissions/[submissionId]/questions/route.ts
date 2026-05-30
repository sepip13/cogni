import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMComplete, resolveModelForPlan } from "@/lib/freellm";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const maxDuration = 120;

const TEMPERATURE = 0.5;
const MAX_TOKENS = 2600;
const MAX_RUBRIC_CHARS = 40_000;
const MAX_WORK_CHARS = 40_000;
const QUESTIONS_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        q: z.string(),
        why_asked: z.string(),
        key_points: z.array(z.string()),
        difficulty: z.enum(["easy", "medium", "hard"]),
      })
    )
    .min(1),
});

type Params = { params: Promise<{ id: string; submissionId: string }> };

async function loadOwned(courseId: string, submissionId: string, userId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      userId: true,
      courseId: true,
      title: true,
      kind: true,
      parsedText: true,
      questions: true,
      course: { select: { userId: true, name: true, educationLevel: true, rawText: true } },
    },
  });
  if (
    !submission ||
    submission.courseId !== courseId ||
    submission.userId !== userId ||
    submission.course.userId !== userId
  ) {
    return null;
  }
  return submission;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId, submissionId } = await params;
  const submission = await loadOwned(courseId, submissionId, session.user.id);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cached = submission.questions as z.infer<typeof QuestionsSchema> | null;
  return NextResponse.json({ questions: cached?.questions ?? [] });
}

function buildSystemPrompt(courseName: string, level: string | null): string {
  const levelLine = level ? `\nThe student is studying at this level: ${level}.` : "";
  return `You are an examiner who will question a student about THIS work they submitted for ${courseName}.${levelLine}
Generate the questions an examiner is most likely to ask in a viva / defense — probing their understanding, the choices they made, and the weak spots in the work — grounded in the ACTUAL content of their submission and the course rubric. Mix difficulties.
For each question provide: the question, why an examiner would ask it, and the key points a strong answer must contain.
Return JSON only:
{
  "questions": [
    { "q": string, "why_asked": string, "key_points": [string], "difficulty": "easy" | "medium" | "hard" }
  ]
}`;
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: courseId, submissionId } = await params;
  const submission = await loadOwned(courseId, submissionId, userId);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const workText = (submission.parsedText ?? "").trim();
  if (!workText) {
    return NextResponse.json(
      { error: "No readable content in this submission yet." },
      { status: 400 }
    );
  }

  const limit = rateLimit(`questions:${userId}`, QUESTIONS_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  const requestedModel = typeof body.model === "string" ? body.model : null;
  const model = resolveModelForPlan(await isProUser(userId), requestedModel);

  const userMessage = `Course rubric / material:
<rubric>
${(submission.course.rawText ?? "(no course material provided)").slice(0, MAX_RUBRIC_CHARS)}
</rubric>

Student work — "${submission.title}" (${submission.kind}):
<work>
${workText.slice(0, MAX_WORK_CHARS)}
</work>`;

  let raw: string;
  try {
    raw = await freeLLMComplete(
      [
        { role: "system", content: buildSystemPrompt(submission.course.name, submission.course.educationLevel) },
        { role: "user", content: userMessage },
      ],
      { temperature: TEMPERATURE, jsonMode: true, model, maxTokens: MAX_TOKENS }
    );
  } catch (err) {
    const msg =
      err instanceof Error && err.message
        ? err.message
        : "The question service is temporarily unavailable. Please try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let parsed: z.infer<typeof QuestionsSchema>;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = QuestionsSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json(
      { error: "The question response was malformed. Please try again." },
      { status: 502 }
    );
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: { questions: parsed },
  });

  return NextResponse.json({ questions: parsed.questions });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMComplete } from "@/lib/freellm";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const maxDuration = 120;

const TEMPERATURE = 0.3;
const MAX_WORK_CHARS = 20_000;
const GRADE_LIMIT = { max: 80, windowMs: 10 * 60 * 1000 };

const GradeSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["correct", "partially_correct", "incorrect"]),
  feedback: z.string(),
  missing_points: z.array(z.string()),
  strengths: z.array(z.string()),
});

interface CachedQuestion {
  q: string;
  why_asked: string;
  key_points: string[];
  difficulty: "easy" | "medium" | "hard";
}

function buildSystemPrompt(courseName: string): string {
  return `You are an examiner grading a student's spoken-style answer to a viva question about
their own submitted work for ${courseName}. You are given the question, the key points a strong
answer must contain, an excerpt of the student's actual work, and the student's answer.
Grade 0–100 based on:
- Coverage of the key points (50%)
- Correctness and depth of understanding (35%)
- Consistency with their own submitted work (15%)
Return JSON only:
{
  "score": number,
  "verdict": "correct|partially_correct|incorrect",
  "feedback": "specific, actionable feedback in 2-3 sentences",
  "missing_points": ["key point the answer missed"],
  "strengths": ["what the answer got right"]
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
      questions: true,
      course: { select: { userId: true, name: true } },
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

  let body: { questionIndex?: unknown; answer?: unknown; model?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const index = typeof body.questionIndex === "number" ? body.questionIndex : -1;
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer) {
    return NextResponse.json({ error: "An answer is required." }, { status: 400 });
  }

  const cached = submission.questions as { questions?: CachedQuestion[] } | null;
  const question = cached?.questions?.[index];
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const limit = rateLimit(`vivagrade:${userId}`, GRADE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many answers graded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "auto";

  const userMessage = `Question: ${question.q}

Key points a strong answer must contain:
${question.key_points.map((p) => `- ${p}`).join("\n")}

Excerpt of the student's submitted work:
${(submission.parsedText ?? "").slice(0, MAX_WORK_CHARS)}

Student's answer: ${answer}`;

  let raw: string;
  try {
    raw = await freeLLMComplete(
      [
        { role: "system", content: buildSystemPrompt(submission.course.name) },
        { role: "user", content: userMessage },
      ],
      { temperature: TEMPERATURE, jsonMode: true, model }
    );
  } catch (err) {
    const msg =
      err instanceof Error && err.message
        ? err.message
        : "The grading service is temporarily unavailable. Please try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let grade: z.infer<typeof GradeSchema>;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    grade = GradeSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json(
      { error: "Grading response was malformed. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json(grade);
}

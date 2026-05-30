import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMComplete, resolveModelForPlan } from "@/lib/freellm";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const maxDuration = 120;

const TEMPERATURE = 0.3;
const GRADE_LIMIT = { max: 100, windowMs: 10 * 60 * 1000 };

const GradeSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["correct", "partially_correct", "incorrect"]),
  feedback: z.string(),
  missing_points: z.array(z.string()),
  strengths: z.array(z.string()),
});

interface MockQuestion {
  q: string;
  expected_answer?: string;
  key_points?: string[];
}

function buildSystemPrompt(courseName: string): string {
  return `You are grading a student's answer to a practice exam question for ${courseName}.
You are given the question, the model expected answer, the key points a strong answer must contain, and the student's answer.
Grade 0–100 based on coverage of the key points (55%), correctness (35%), and use of correct terminology (10%).
Return JSON only:
{ "score": number, "verdict": "correct|partially_correct|incorrect", "feedback": "2-3 sentences", "missing_points": ["..."], "strengths": ["..."] }`;
}

type Params = { params: Promise<{ id: string; mockId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId, mockId } = await params;

  const mock = await prisma.mockExam.findUnique({
    where: { id: mockId },
    select: { courseId: true, questions: true, course: { select: { name: true, userId: true } } },
  });
  if (!mock || mock.courseId !== courseId || mock.course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { questionIndex?: unknown; answer?: unknown };
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

  const questions = (Array.isArray(mock.questions) ? mock.questions : []) as unknown as MockQuestion[];
  const question = questions[index];
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const limit = rateLimit(`mockgrade:${userId}`, GRADE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many answers graded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const model = resolveModelForPlan(await isProUser(userId));

  const userMessage = `Question: ${question.q}

Model expected answer: ${question.expected_answer ?? "(not provided)"}

Key points a strong answer must contain:
${(question.key_points ?? []).map((p) => `- ${p}`).join("\n") || "(none provided)"}

Student's answer: ${answer}`;

  let raw: string;
  try {
    raw = await freeLLMComplete(
      [
        { role: "system", content: buildSystemPrompt(mock.course.name) },
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
    return NextResponse.json({ error: "Grading response was malformed. Please try again." }, { status: 502 });
  }

  return NextResponse.json(grade);
}

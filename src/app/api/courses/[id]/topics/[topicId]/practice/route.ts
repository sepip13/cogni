import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const MODEL = "claude-sonnet-4-5";
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 30_000;

// §6.2 exact system prompt
function buildSystemPrompt(courseName: string): string {
  return `You are grading a student's practice answer for ${courseName}.
The question, the expected answer, the relevant rubric (if present), and the
source page from the course material are given. Grade the student's answer
0–100 based on:
- Factual correctness against the source (60%)
- Completeness vs the expected answer (25%)
- Use of correct terminology (15%)
Return JSON only:
{
  "score": number,
  "verdict": "correct|partially_correct|incorrect",
  "feedback": "specific, actionable feedback in 2-3 sentences",
  "missing_points": ["bullet of what was missed"],
  "strengths": ["bullet of what was correct"]
}`;
}

const GradeSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["correct", "partially_correct", "incorrect"]),
  feedback: z.string(),
  missing_points: z.array(z.string()),
  strengths: z.array(z.string()),
});

type Params = { params: Promise<{ id: string; topicId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, topicId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true, name: true },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { courseId: true, practiceQuestions: true },
  });

  if (!topic || topic.courseId !== courseId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { questionIndex: number; answer: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const questions = topic.practiceQuestions as Array<{
    q: string;
    source: string;
    expected_answer: string;
  }>;

  const question = questions[body.questionIndex];
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const userMessage = `Question: ${question.q}

Expected answer: ${question.expected_answer}

Source: ${question.source}

Student's answer: ${body.answer}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let raw: string;
  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        temperature: TEMPERATURE,
        system: buildSystemPrompt(course.name),
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal }
    );
    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected content type");
    raw = block.text;
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : "LLM error";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  let grade: z.infer<typeof GradeSchema>;
  try {
    grade = GradeSchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Grading response was malformed" }, { status: 502 });
  }

  // Persist attempt
  await prisma.practiceAttempt.create({
    data: {
      topicId,
      userId: session.user.id,
      questionIndex: body.questionIndex,
      userAnswer: body.answer,
      score: grade.score,
      verdict: grade.verdict,
      feedback: grade.feedback,
    },
  });

  return NextResponse.json(grade);
}

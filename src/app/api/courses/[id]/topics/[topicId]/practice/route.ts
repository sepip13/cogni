import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMComplete } from "@/lib/freellm";
import { z } from "zod";

const TEMPERATURE = 0.3;

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

  let raw: string;
  try {
    raw = await freeLLMComplete(
      [
        { role: "system", content: buildSystemPrompt(course.name) },
        { role: "user", content: userMessage },
      ],
      { temperature: TEMPERATURE, jsonMode: true }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let grade: z.infer<typeof GradeSchema>;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    grade = GradeSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Grading response was malformed" }, { status: 502 });
  }

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

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveModelForPlan } from "@/lib/freellm";
import { gradeAnswer, type GradeQuestion } from "@/lib/grade-answer";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const GRADE_LIMIT = { max: 100, windowMs: 10 * 60 * 1000 };

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId, sectionId } = await params;

  const section = await prisma.studyGuideSection.findUnique({
    where: { id: sectionId },
    select: {
      quiz: true,
      guide: { select: { courseId: true, course: { select: { name: true, userId: true } } } },
    },
  });
  if (!section || section.guide.courseId !== courseId || section.guide.course.userId !== userId) {
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

  const questions = (Array.isArray(section.quiz) ? section.quiz : []) as unknown as GradeQuestion[];
  const question = questions[index];
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const limit = rateLimit(`sectionquizgrade:${userId}`, GRADE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many answers graded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const model = resolveModelForPlan(await isProUser(userId));

  try {
    const grade = await gradeAnswer(section.guide.course.name, question, answer, model);
    return NextResponse.json(grade);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Grading failed. Please try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

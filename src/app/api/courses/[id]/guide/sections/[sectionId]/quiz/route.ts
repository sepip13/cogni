import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { generateSectionQuiz } from "@/lib/section-quiz";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const QUIZ_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 }; // 60 section quizzes / hour / user
const MIN_COUNT = 1;
const MAX_COUNT = 3;
const DEFAULT_COUNT = 2;

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
    select: { id: true, guide: { select: { courseId: true, course: { select: { userId: true } } } } },
  });

  if (!section || section.guide.courseId !== courseId || section.guide.course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limit = rateLimit(`sectionquiz:${userId}`, QUIZ_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're generating questions quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { count?: unknown; model?: unknown };
  const rawCount = typeof body.count === "number" ? Math.round(body.count) : DEFAULT_COUNT;
  const count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, rawCount));
  const requested = typeof body.model === "string" ? body.model : null;
  const model = resolveLargeContextModel(await isProUser(userId), requested);

  // Mark GENERATING now so the next guide poll reflects it immediately.
  await prisma.studyGuideSection.update({ where: { id: sectionId }, data: { quizStatus: "GENERATING" } });
  after(async () => {
    await generateSectionQuiz(sectionId, model, count);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

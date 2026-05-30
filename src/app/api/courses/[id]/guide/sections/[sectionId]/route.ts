import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { generateSection } from "@/lib/guide";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const SECTION_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 }; // 60 sections / hour / user

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

  const limit = rateLimit(`guidesection:${userId}`, SECTION_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're generating sections quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  const requested = typeof body.model === "string" ? body.model : null;
  const model = resolveLargeContextModel(await isProUser(userId), requested);

  // Mark GENERATING now so the next poll reflects it immediately, then build in the background.
  await prisma.studyGuideSection.update({ where: { id: sectionId }, data: { status: "GENERATING" } });
  after(async () => {
    await generateSection(sectionId, model);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { generateFlashcards, type FlashcardScope } from "@/lib/flashcards";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const FLASHCARD_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 }; // 30 generations / hour / user

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { userId: true } });
  if (!course || course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limit = rateLimit(`flashcards:${userId}`, FLASHCARD_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're making cards quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { conceptKey?: unknown; scope?: unknown; model?: unknown };
  const conceptKey = typeof body.conceptKey === "string" ? body.conceptKey : null;
  const rawScope = body.scope === "concept" || body.scope === "guide" ? body.scope : null;
  const scope: FlashcardScope = rawScope ?? (conceptKey ? "concept" : "guide");

  if (scope === "concept" && !conceptKey) {
    return NextResponse.json({ error: "A concept is required for concept-scoped cards." }, { status: 400 });
  }

  const requested = typeof body.model === "string" ? body.model : null;
  const model = resolveLargeContextModel(await isProUser(userId), requested);

  after(async () => {
    await generateFlashcards(courseId, { scope, conceptKey, model });
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

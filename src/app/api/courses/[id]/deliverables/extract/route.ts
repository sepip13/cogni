import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { extractDeliverables } from "@/lib/deliverables";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { userHasJobCapacity } from "@/lib/concurrency";

export const maxDuration = 300;

const EXTRACT_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 }; // 10 / hour / user

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true, rawText: true },
  });
  if (!course || course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!course.rawText?.trim()) {
    return NextResponse.json(
      { error: "Add course materials first — there's nothing to read yet." },
      { status: 400 }
    );
  }

  const limit = rateLimit(`deliverables:${userId}`, EXTRACT_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're extracting quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  if (!(await userHasJobCapacity(userId))) {
    return NextResponse.json(
      { error: "You have several jobs running. Let those finish, then try again." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  const requested = typeof body.model === "string" ? body.model : null;
  const model = resolveLargeContextModel(await isProUser(userId), requested);

  await prisma.course.update({
    where: { id: courseId },
    data: { deliverablesStatus: "GENERATING", deliverablesError: null },
  });

  after(async () => {
    await extractDeliverables(courseId, model);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}

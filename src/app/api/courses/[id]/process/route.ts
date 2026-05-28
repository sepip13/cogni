import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ingestCourse } from "@/lib/ingestion";
import { isUserPro } from "@/lib/access-codes";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Confirm course belongs to this user + fetch user plan
  const [course, dbUser] = await Promise.all([
    prisma.course.findUnique({ where: { id }, select: { id: true, userId: true, status: true } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { plan: true, proAccessEndsAt: true, preferredLanguage: true } }),
  ]);

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userPlan = isUserPro(dbUser ?? { plan: "FREE", proAccessEndsAt: null }) ? "PRO" : "FREE";
  const userLanguage = dbUser?.preferredLanguage ?? "English";

  // Idempotent: skip if already READY, re-run if FAILED
  if (course.status === "READY") {
    return NextResponse.json({ status: "READY" });
  }

  // Re-set to PROCESSING so the polling UI shows the right state
  await prisma.course.update({
    where: { id },
    data: { status: "PROCESSING" },
  });

  // Run ingestion after response is sent (Next.js keeps the work alive)
  after(async () => {
    try {
      await ingestCourse(id, "auto", userPlan, userLanguage);
    } catch (err) {
      console.error(`[process:${id}] unhandled error:`, err);
    }
  });

  return NextResponse.json({ status: "PROCESSING" }, { status: 202 });
}

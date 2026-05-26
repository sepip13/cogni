import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ingestCourse } from "@/lib/ingestion";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Confirm course belongs to this user
  const course = await prisma.course.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Idempotent: skip if already READY, re-run if FAILED, block if still PROCESSING another attempt
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
      await ingestCourse(id);
    } catch (err) {
      console.error(`[process:${id}] unhandled error:`, err);
    }
  });

  return NextResponse.json({ status: "PROCESSING" }, { status: 202 });
}

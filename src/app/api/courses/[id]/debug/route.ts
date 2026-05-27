/**
 * GET /api/courses/[id]/debug
 *
 * Returns the stored failure reason (if any) for a FAILED course.
 * Only accessible by the course owner.
 * Use this to diagnose ingestion failures from the server logs or admin UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      name: true,
      rawText: true,
      plan: true,
      createdAt: true,
      updatedAt: true,
      files: {
        select: {
          fileName: true,
          fileType: true,
          pageCount: true,
          parsedText: true,
        },
      },
    },
  });

  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Extract stored error if present
  const planData = course.plan as Record<string, unknown> | null;
  const storedError =
    planData && "_error" in planData ? planData._error : null;

  return NextResponse.json({
    courseId: course.id,
    status: course.status,
    name: course.name,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    rawTextLength: course.rawText?.length ?? 0,
    rawTextPreview: course.rawText?.slice(0, 500) ?? null,
    failureReason: storedError ?? null,
    files: course.files.map((f) => ({
      name: f.fileName,
      type: f.fileType,
      pages: f.pageCount,
      parsedLength: f.parsedText?.length ?? 0,
      parsedPreview: f.parsedText?.slice(0, 200) ?? null,
    })),
  });
}

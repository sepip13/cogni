import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const TEXT_PREVIEW_CHARS = 4000;

type Params = { params: Promise<{ id: string; submissionId: string }> };

async function loadOwnedSubmission(courseId: string, submissionId: string, userId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      courseId: true,
      userId: true,
      title: true,
      kind: true,
      status: true,
      fileName: true,
      fileType: true,
      blobUrl: true,
      pageCount: true,
      parsedText: true,
      questions: true,
      createdAt: true,
      updatedAt: true,
      course: { select: { userId: true, name: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          scoreOutOf10: true,
          rubricBreakdown: true,
          strengths: true,
          gaps: true,
          actionItems: true,
          summary: true,
          percentage: true,
          band: true,
          nextBand: true,
          gapToNextBand: true,
          modelId: true,
          createdAt: true,
        },
      },
    },
  });

  if (
    !submission ||
    submission.courseId !== courseId ||
    submission.userId !== userId ||
    submission.course.userId !== userId
  ) {
    return null;
  }
  return submission;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, submissionId } = await params;
  const submission = await loadOwnedSubmission(courseId, submissionId, session.user.id);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const text = submission.parsedText ?? "";
  return NextResponse.json({
    submission: {
      id: submission.id,
      title: submission.title,
      kind: submission.kind,
      status: submission.status,
      fileName: submission.fileName,
      fileType: submission.fileType,
      blobUrl: submission.blobUrl,
      pageCount: submission.pageCount,
      hasText: text.trim().length > 0,
      textPreview: text.slice(0, TEXT_PREVIEW_CHARS),
      textTruncated: text.length > TEXT_PREVIEW_CHARS,
      hasQuestions: Array.isArray(
        (submission.questions as { questions?: unknown[] } | null)?.questions
      ),
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    },
    reviews: submission.reviews,
    courseName: submission.course.name,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, submissionId } = await params;
  const submission = await loadOwnedSubmission(courseId, submissionId, session.user.id);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.submission.delete({ where: { id: submissionId } });
  return NextResponse.json({ deleted: true });
}

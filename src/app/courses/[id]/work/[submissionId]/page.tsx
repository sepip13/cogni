import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/AppLayout";
import { WorkDetail } from "./WorkDetail";

type PageProps = { params: Promise<{ id: string; submissionId: string }> };

export default async function WorkPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { id: courseId, submissionId } = await params;

  // Server-side ownership check so non-owners never see the shell.
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { courseId: true, userId: true, course: { select: { userId: true } } },
  });

  if (
    !submission ||
    submission.courseId !== courseId ||
    submission.userId !== session.user.id ||
    submission.course.userId !== session.user.id
  ) {
    redirect(`/courses/${courseId}`);
  }

  return (
    <AppLayout>
      <div className="container">
        <WorkDetail courseId={courseId} submissionId={submissionId} />
      </div>
    </AppLayout>
  );
}

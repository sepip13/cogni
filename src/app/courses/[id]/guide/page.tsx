import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/AppLayout";
import { StudyGuideView } from "./StudyGuideView";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function GuidePage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { id: courseId } = await params;
  const sp = await searchParams;
  const initialReview = typeof sp.review === "string" ? sp.review : null;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true, name: true },
  });
  if (!course || course.userId !== session.user.id) {
    redirect(`/courses/${courseId}`);
  }

  return (
    <AppLayout>
      <div className="container">
        <StudyGuideView courseId={courseId} courseName={course.name} initialReview={initialReview} />
      </div>
    </AppLayout>
  );
}

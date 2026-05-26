import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/AppLayout";
import { SourceViewer } from "./SourceViewer";

type PageProps = {
  params: Promise<{ id: string; fileId: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function SourcePage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { id: courseId, fileId } = await params;
  const { page: pageParam } = await searchParams;

  const file = await prisma.sourceFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      blobUrl: true,
      pageCount: true,
      parsedText: true,
      courseId: true,
      course: { select: { userId: true, name: true, id: true } },
    },
  });

  if (!file || file.courseId !== courseId || file.course.userId !== session.user.id) {
    redirect(`/courses/${courseId}`);
  }

  const citedPage = pageParam ? parseInt(pageParam, 10) : null;

  return (
    <AppLayout>
      <div className="container" style={{ paddingBottom: 40 }}>
        <SourceViewer
          courseId={courseId}
          courseName={file.course.name}
          fileName={file.fileName}
          fileType={file.fileType}
          blobUrl={file.blobUrl}
          parsedText={file.parsedText ?? ""}
          citedPage={citedPage}
        />
      </div>
    </AppLayout>
  );
}

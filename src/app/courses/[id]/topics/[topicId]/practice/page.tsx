import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { PracticeSession } from "./PracticeSession";

type PageProps = { params: Promise<{ id: string; topicId: string }> };

export default async function PracticePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const { id, topicId } = await params;
  return (
    <AppLayout>
      <div className="container">
        <PracticeSession courseId={id} topicId={topicId} />
      </div>
    </AppLayout>
  );
}

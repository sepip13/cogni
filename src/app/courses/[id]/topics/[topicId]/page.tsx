import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { TopicDetail } from "./TopicDetail";

type PageProps = { params: Promise<{ id: string; topicId: string }> };

export default async function TopicPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const { id, topicId } = await params;
  return (
    <AppLayout>
      <div className="container">
        <TopicDetail courseId={id} topicId={topicId} />
      </div>
    </AppLayout>
  );
}

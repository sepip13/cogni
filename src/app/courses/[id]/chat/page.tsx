import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatAdvisor } from "./ChatAdvisor";

type PageProps = { params: Promise<{ id: string }> };

export default async function ChatPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const { id } = await params;
  return (
    <AppLayout>
      {/* No container — chat needs full height and custom padding */}
      <div style={{ padding: "0 24px" }}>
        <ChatAdvisor courseId={id} />
      </div>
    </AppLayout>
  );
}

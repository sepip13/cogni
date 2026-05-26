import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { CourseDashboard } from "./CourseDashboard";

type PageProps = { params: Promise<{ id: string }> };

export default async function CoursePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const { id } = await params;
  return (
    <AppLayout>
      <div className="container">
        <CourseDashboard courseId={id} />
      </div>
    </AppLayout>
  );
}

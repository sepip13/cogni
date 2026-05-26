import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { CoursesClient } from "./CoursesClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return (
    <AppLayout>
      <div className="container">
        <CoursesClient userName={session.user.name ?? null} />
      </div>
    </AppLayout>
  );
}

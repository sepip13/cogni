import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { CoursesClient } from "./CoursesClient";

type PageProps = {
  searchParams: Promise<{ accessGranted?: string; until?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const { accessGranted, until } = await searchParams;

  return (
    <AppLayout>
      <div className="container">
        <CoursesClient
          userName={session.user.name ?? null}
          accessGranted={accessGranted === "1"}
          accessUntil={until ?? null}
        />
      </div>
    </AppLayout>
  );
}

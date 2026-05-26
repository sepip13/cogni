import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { CalendarView } from "./CalendarView";

type PageProps = { params: Promise<{ id: string }> };

export default async function CalendarPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const { id } = await params;
  return (
    <AppLayout>
      <div className="container">
        <CalendarView courseId={id} />
      </div>
    </AppLayout>
  );
}

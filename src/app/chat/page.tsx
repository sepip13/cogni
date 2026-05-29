import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatPage } from "./ChatPage";

export const metadata: Metadata = {
  title: "Chat — Cogni",
};

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  return (
    <AppLayout>
      <ChatPage />
    </AppLayout>
  );
}

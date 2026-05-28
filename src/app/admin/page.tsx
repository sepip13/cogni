import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { Metadata } from "next";
import { AdminPanel } from "./AdminPanel";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin — Cogni" };

export default async function AdminPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!isAdmin(email)) redirect("/dashboard");

  // Fetch users from our own admin API (server-to-server, secret stays on server)
  const base = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3012";
  const res = await fetch(`${base}/api/admin/users`, {
    headers: { Authorization: `Bearer ${process.env.ADMIN_SECRET ?? ""}` },
    cache: "no-store",
  });

  const users = res.ok ? await res.json() : [];

  return (
    <AppLayout>
      <AdminPanel initialUsers={users} />
    </AppLayout>
  );
}

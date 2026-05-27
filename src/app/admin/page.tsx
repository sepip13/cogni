import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { Metadata } from "next";
import { AdminPanel } from "./AdminPanel";

export const metadata: Metadata = { title: "Admin — Cogni" };

// Comma-separated list of admin emails in env, e.g. "a@b.com,c@d.com"
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "pouglife@gmail.com,sepipsy@gmail.com,sepspipsy@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase());

export default async function AdminPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !ADMIN_EMAILS.includes(email)) redirect("/dashboard");

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

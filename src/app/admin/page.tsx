import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { Metadata } from "next";
import { AdminPanel } from "./AdminPanel";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin — Cogni" };

export default async function AdminPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!isAdmin(email)) redirect("/admin/login");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      proAccessEndsAt: true,
      stripeSubscriptionId: true,
      createdAt: true,
      _count: { select: { courses: true, redemptions: true } },
      courses: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          _count: { select: { topics: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = JSON.parse(JSON.stringify(users));

  return (
    <AppLayout>
      <AdminPanel initialUsers={serialized} />
    </AppLayout>
  );
}

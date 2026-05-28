import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/AppLayout";
import { LanguageSettingsForm } from "./LanguageSettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredLanguage: true },
  });

  return (
    <AppLayout>
      <div className="container fade-in">
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Settings
        </h1>
        <div style={{ marginTop: 32 }}>
          <LanguageSettingsForm currentLanguage={user?.preferredLanguage ?? "English"} />
        </div>
      </div>
    </AppLayout>
  );
}

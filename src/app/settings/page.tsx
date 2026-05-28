import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/AppLayout";
import { LanguageSettingsForm } from "./LanguageSettingsForm";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      plan: true,
      proAccessEndsAt: true,
      preferredLanguage: true,
      preferredQualityTier: true,
      password: true,
    },
  });

  return (
    <AppLayout>
      <div className="container fade-in">
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 32 }}>
          Settings
        </h1>

        <SettingsClient
          email={user?.email ?? ""}
          name={user?.name ?? ""}
          plan={user?.plan ?? "FREE"}
          proAccessEndsAt={user?.proAccessEndsAt?.toISOString() ?? null}
          preferredQualityTier={user?.preferredQualityTier ?? "balanced"}
          hasPassword={!!user?.password}
        />

        <div style={{ marginTop: 24 }}>
          <LanguageSettingsForm currentLanguage={user?.preferredLanguage ?? "English"} />
        </div>
      </div>
    </AppLayout>
  );
}

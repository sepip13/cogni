import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return (
    <AppLayout>
      <div className="container fade-in">
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Settings
        </h1>
        <p style={{ color: "var(--text-dim)", marginTop: 8 }}>
          Account management coming in Step 14.
        </p>
      </div>
    </AppLayout>
  );
}

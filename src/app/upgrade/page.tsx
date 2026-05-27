import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { Metadata } from "next";
import { UpgradeButton } from "./UpgradeButton";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Upgrade to Pro — Cogni",
};

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { success, canceled } = await searchParams;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });
  const isPro = dbUser?.plan === "PRO";

  return (
    <AppLayout>
      <div
        style={{
          maxWidth: 560,
          margin: "60px auto 0",
          padding: "0 24px 80px",
          textAlign: "center",
        }}
        className="fade-in"
      >
        {/* Success banner */}
        {success && (
          <div style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 32,
            fontSize: 14,
            color: "var(--accent)",
            fontWeight: 600,
          }}>
            🎉 Payment successful! Your account is now Pro.
          </div>
        )}

        {/* Canceled banner */}
        {canceled && (
          <div style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 32,
            fontSize: 14,
            color: "var(--text-dim)",
          }}>
            Payment canceled — you can upgrade anytime.
          </div>
        )}

        {/* Already Pro banner */}
        {isPro && !success && (
          <div style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 32,
            fontSize: 14,
            color: "var(--accent)",
            fontWeight: 600,
          }}>
            ✦ You&apos;re already on the Pro plan!
          </div>
        )}

        {/* Badge */}
        <div
          style={{
            display: "inline-block",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--accent)",
            background: "var(--accent-soft)",
            padding: "4px 14px",
            borderRadius: 20,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          ✦ Pro Plan
        </div>

        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            marginBottom: 14,
          }}
        >
          Unlock <span className="grad-text">Claude AI</span>
        </h1>

        <p style={{ color: "var(--text-dim)", fontSize: 16, marginBottom: 40, lineHeight: 1.6 }}>
          Pro gives you access to Claude Haiku, Sonnet, and Opus —
          Anthropic&apos;s most accurate models for study plan generation.
        </p>

        {/* Feature comparison */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 40,
            textAlign: "left",
          }}
        >
          {/* Free */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Free
            </div>
            {[
              "16 free AI models",
              "Gemini · Groq · OpenRouter",
              "Unlimited courses",
              "All core features",
            ].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: "var(--accent-2)" }}>✓</span>
                <span style={{ color: "var(--text-dim)" }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Pro */}
          <div
            style={{
              background: "var(--surface-2)",
              border: "2px solid var(--accent)",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              ✦ Pro — $9.99/mo
            </div>
            {[
              "Everything in Free",
              "Claude Haiku (fast)",
              "Claude Sonnet (balanced)",
              "Claude Opus (best quality)",
            ].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: "var(--accent)" }}>✓</span>
                <span style={{ color: "var(--text)" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        {!isPro ? (
          <>
            <UpgradeButton />
            <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
              Secure payment via Stripe · Cancel anytime
            </p>
          </>
        ) : (
          <a
            href="/courses/new"
            style={{
              display: "inline-block",
              padding: "14px 40px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Start a new course →
          </a>
        )}
      </div>
    </AppLayout>
  );
}

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findValidCode, redeemCode, RedeemError } from "@/lib/access-codes";
import { AppLayout } from "@/components/layout/AppLayout";

type PageProps = {
  searchParams: Promise<{ code?: string; claimError?: string }>;
};

function StatusCard({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div
        style={{
          maxWidth: 480,
          margin: "80px auto 0",
          padding: "0 24px 80px",
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </AppLayout>
  );
}

function InvalidState({ message }: { message: string }) {
  return (
    <StatusCard>
      <div
        style={{
          width: 56,
          height: 56,
          background: "var(--surface-2)",
          borderRadius: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          marginBottom: 20,
        }}
      >
        🔒
      </div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 10,
        }}
      >
        Link not valid
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 28 }}>
        {message}
      </p>
      <a
        href="/upgrade"
        style={{
          fontSize: 13,
          color: "var(--accent)",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        View upgrade options →
      </a>
    </StatusCard>
  );
}

export default async function AccessPage({ searchParams }: PageProps) {
  const { code, claimError } = await searchParams;

  if (!code) {
    return <InvalidState message="No access code was provided in this link." />;
  }

  const upper = code.toUpperCase();
  const validCode = await findValidCode(upper);

  if (!validCode) {
    return (
      <InvalidState message="This access link is no longer valid — it may have expired or already been used." />
    );
  }

  const session = await auth();

  let alreadyRedeemed = false;
  if (session?.user?.id) {
    const existing = await prisma.accessCodeRedemption.findUnique({
      where: { codeId_userId: { codeId: validCode.id, userId: session.user.id } },
      select: { id: true },
    });
    alreadyRedeemed = !!existing;
  }

  async function claimAction() {
    "use server";
    const s = await auth();
    if (!s?.user?.id) {
      redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/access?code=${upper}`)}`);
    }
    let accessEndsAt: Date;
    try {
      const result = await redeemCode(upper, s.user.id);
      accessEndsAt = result.accessEndsAt;
    } catch (err) {
      const msg =
        err instanceof RedeemError
          ? encodeURIComponent(err.message)
          : "something_went_wrong";
      redirect(`/access?code=${upper}&claimError=${msg}`);
    }
    redirect(
      `/dashboard?accessGranted=1&until=${encodeURIComponent(accessEndsAt.toISOString())}`
    );
  }

  const signinUrl = `/auth/signin?callbackUrl=${encodeURIComponent(`/access?code=${upper}`)}`;

  return (
    <StatusCard>
      {/* Icon */}
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
        ✦ Pro Invite
      </div>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          marginBottom: 12,
        }}
      >
        You&apos;ve been invited to{" "}
        <span
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Cogni Pro
        </span>
      </h1>

      <p style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 36, lineHeight: 1.6 }}>
        This link gives you{" "}
        <strong style={{ color: "var(--text)" }}>{validCode.durationDays} days</strong> of Pro
        access — premium AI models for your study plans.
      </p>

      {claimError && (
        <div
          style={{
            background: "rgba(255,107,107,0.1)",
            border: "1px solid rgba(255,107,107,0.3)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--high, #ff6b6b)",
            marginBottom: 20,
          }}
        >
          {decodeURIComponent(claimError)}
        </div>
      )}

      {!session?.user ? (
        <a
          href={signinUrl}
          style={{
            display: "inline-block",
            padding: "13px 32px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: "var(--bg)",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Sign in to claim →
        </a>
      ) : alreadyRedeemed ? (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            padding: "16px 20px",
            fontSize: 14,
            color: "var(--text-dim)",
          }}
        >
          You&apos;ve already redeemed this code.{" "}
          <a href="/dashboard" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
            Go to dashboard →
          </a>
        </div>
      ) : (
        <form action={claimAction}>
          <input type="hidden" name="code" value={upper} />
          <button
            type="submit"
            style={{
              display: "inline-block",
              padding: "13px 32px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Claim {validCode.durationDays} days free →
          </button>
        </form>
      )}

      <p style={{ marginTop: 20, fontSize: 12, color: "var(--text-faint)" }}>
        No credit card required · Activates instantly
      </p>
    </StatusCard>
  );
}

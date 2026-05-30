import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { resolveShare, incrementShareView } from "@/lib/share";
import { ShareView } from "./ShareView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared study plan · Cogni",
  description: "A study plan shared with you on Cogni.",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

function CenteredNotice({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }} aria-hidden="true">{emoji}</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>{title}</h1>
        <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: action ? 24 : 0 }}>{body}</p>
        {action}
      </div>
    </main>
  );
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;

  const resolved = await resolveShare(token);
  if (!resolved) {
    return (
      <CenteredNotice
        emoji="🔗"
        title="This link is no longer available"
        body="The share link may have been revoked, expired, or is incorrect. Ask the person who shared it for an up-to-date link."
        action={
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "11px 22px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Go to Cogni
          </Link>
        }
      />
    );
  }

  const { share, course } = resolved;

  // Private share (sign-in required) — prompt for sign-in rather than auto-redirect.
  if (!share.publicNoAuth) {
    const session = await auth();
    if (!session?.user?.id) {
      return (
        <CenteredNotice
          emoji="🔒"
          title="Sign in to view this plan"
          body="The owner restricted this shared study plan to signed-in users."
          action={
            <Link
              href={`/auth/signin?callbackUrl=${encodeURIComponent(`/share/${token}`)}`}
              style={{
                display: "inline-block",
                padding: "11px 22px",
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "var(--bg)",
                borderRadius: 9,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Sign in
            </Link>
          }
        />
      );
    }
  }

  // Best-effort view counter (non-blocking).
  incrementShareView(share.id);

  return <ShareView token={token} course={course} includeSources={share.includeSources} />;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UpgradeButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 && data.error?.includes("Already on Pro")) {
          router.push("/dashboard");
          return;
        }
        throw new Error(data.error ?? "Something went wrong");
      }
      // Redirect to Stripe hosted checkout
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        style={{
          display: "inline-block",
          padding: "14px 40px",
          background: loading
            ? "var(--surface-2)"
            : "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: loading ? "var(--text-dim)" : "var(--bg)",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          textDecoration: "none",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          marginBottom: 16,
          transition: "opacity 0.15s",
        }}
      >
        {loading ? "Redirecting to Stripe…" : "Upgrade to Pro — $9.99 / month →"}
      </button>

      {error && (
        <p style={{ fontSize: 13, color: "var(--error, #ef4444)", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

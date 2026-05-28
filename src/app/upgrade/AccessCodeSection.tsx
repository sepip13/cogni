"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccessCodeSection() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/access/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: { accessEndsAt?: string; error?: string } = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      const until = data.accessEndsAt
        ? new Date(data.accessEndsAt).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : "";
      setSuccess(`✦ Pro access activated${until ? ` — expires ${until}` : ""}!`);

      setTimeout(() => {
        router.push(
          `/dashboard?accessGranted=1${data.accessEndsAt ? `&until=${encodeURIComponent(data.accessEndsAt)}` : ""}`
        );
      }, 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-dim)",
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: 3,
        }}
      >
        {open ? "▲ Hide" : "▼ Have an access code?"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 16,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 14,
            padding: "20px 24px",
          }}
        >
          {success ? (
            <div
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent)",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              {success}
            </div>
          ) : (
            <form onSubmit={handleRedeem} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ACCESS CODE"
                  maxLength={12}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 8,
                    color: "var(--text)",
                    fontSize: 14,
                    fontFamily: "var(--font-jetbrains, monospace)",
                    letterSpacing: "0.1em",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !code.trim()}
                style={{
                  padding: "10px 20px",
                  background:
                    loading || !code.trim()
                      ? "var(--surface-2)"
                      : "var(--accent)",
                  color:
                    loading || !code.trim() ? "var(--text-dim)" : "var(--bg)",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading || !code.trim() ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
              >
                {loading ? "…" : "Redeem"}
              </button>

              {error && (
                <p
                  style={{
                    width: "100%",
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: "var(--high, #ff6b6b)",
                  }}
                >
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

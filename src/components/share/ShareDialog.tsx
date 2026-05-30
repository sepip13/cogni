"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShareLink, SharePermission } from "@/app/courses/[id]/types";

const EXPIRY_OPTIONS: { label: string; days: number | undefined }[] = [
  { label: "Never", days: undefined },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-faint)",
  marginBottom: 8,
  display: "block",
};

export function ShareDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [publicNoAuth, setPublicNoAuth] = useState(true);
  const [permission, setPermission] = useState<SharePermission>("VIEW");
  const [includeSources, setIncludeSources] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadShares = useCallback(() => {
    return fetch(`/api/courses/${courseId}/share`)
      .then((r) => (r.ok ? (r.json() as Promise<{ shares: ShareLink[] }>) : Promise.reject(new Error("load failed"))))
      .then((data) => setShares(data.shares))
      .catch(() => {
        /* ignore — list simply stays empty */
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function createLink() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission, publicNoAuth, includeSources, expiresInDays }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not create the link.");
        return;
      }
      await loadShares();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(token: string) {
    setShares((prev) => prev.filter((s) => s.token !== token));
    try {
      await fetch(`/api/courses/${courseId}/share?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
    } catch {
      loadShares(); // restore on failure
    }
  }

  async function copy(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800);
    } catch {
      /* clipboard unavailable — the URL is still selectable in the field */
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="fade-in"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h2 id="share-dialog-title" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Share this course
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ fontSize: 20, color: "var(--text-dim)", lineHeight: 1, padding: 4 }}>
            ×
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
          Create a read-only link to your study plan. Anyone with the link sees the plan, not your
          chat or your work.
        </p>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 20 }}>
          <ToggleRow
            label="Anyone with the link can view"
            hint="No sign-in required"
            checked={publicNoAuth}
            onChange={setPublicNoAuth}
          />

          <div>
            <span style={sectionLabel}>Permission</span>
            <div style={{ display: "flex", gap: 8 }}>
              {(["VIEW", "COMMENT"] as SharePermission[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPermission(p)}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: 9,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: permission === p ? "var(--accent-soft)" : "var(--surface-2)",
                    border: `1px solid ${permission === p ? "var(--accent)" : "var(--border-strong)"}`,
                    color: permission === p ? "var(--accent)" : "var(--text-dim)",
                  }}
                >
                  {p === "VIEW" ? "View only" : "View + comment"}
                </button>
              ))}
            </div>
            {permission === "COMMENT" && (
              <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
                Commenting requires the viewer to sign in.
              </p>
            )}
          </div>

          <div>
            <span style={sectionLabel}>Link expires</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  onClick={() => setExpiresInDays(o.days)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: expiresInDays === o.days ? "var(--accent-soft)" : "var(--surface-2)",
                    border: `1px solid ${expiresInDays === o.days ? "var(--accent)" : "var(--border-strong)"}`,
                    color: expiresInDays === o.days ? "var(--accent)" : "var(--text-dim)",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <ToggleRow
            label="Include source files"
            hint="Let viewers open your uploaded materials"
            checked={includeSources}
            onChange={setIncludeSources}
          />
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 13, color: "var(--high)", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button
          onClick={createLink}
          disabled={creating}
          style={{
            width: "100%",
            padding: "12px",
            background: creating ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: creating ? "var(--text-dim)" : "var(--bg)",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: creating ? "default" : "pointer",
            marginBottom: 20,
          }}
          aria-busy={creating}
        >
          {creating ? "Creating…" : "Create share link"}
        </button>

        {/* Existing links */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <span style={sectionLabel}>Active links</span>
          {loading ? (
            <div className="skeleton" style={{ height: 56, borderRadius: 10 }} />
          ) : shares.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-faint)" }}>No active links yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {shares.map((s) => (
                <ShareRow
                  key={s.token}
                  share={s}
                  copied={copiedToken === s.token}
                  onCopy={() => copy(s.url, s.token)}
                  onRevoke={() => revoke(s.token)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
      <span>
        <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          flexShrink: 0,
          background: checked ? "var(--accent)" : "var(--surface-2)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
          position: "relative",
          transition: "background var(--duration-fast)",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: checked ? "var(--bg)" : "var(--text-faint)",
            transition: "left var(--duration-fast)",
          }}
          aria-hidden="true"
        />
      </button>
    </label>
  );
}

function ShareRow({
  share,
  copied,
  onCopy,
  onRevoke,
}: {
  share: ShareLink;
  copied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  const meta = [
    share.permission === "COMMENT" ? "Comment" : "View",
    share.publicNoAuth ? "Public" : "Sign-in",
    share.includeSources ? "Sources" : null,
    share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}` : "No expiry",
    `${share.viewCount} view${share.viewCount === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          readOnly
          value={share.url}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "7px 10px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            fontSize: 12,
            color: "var(--text-dim)",
            fontFamily: "var(--font-jetbrains), monospace",
            outline: "none",
          }}
          aria-label="Share URL"
        />
        <button
          onClick={onCopy}
          style={{
            padding: "7px 14px",
            background: copied ? "var(--success)" : "var(--accent-soft)",
            border: `1px solid ${copied ? "var(--success)" : "var(--accent)"}`,
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 700,
            color: copied ? "var(--bg)" : "var(--accent)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{meta.join(" · ")}</span>
        <button
          onClick={onRevoke}
          style={{ fontSize: 12, fontWeight: 600, color: "var(--high)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
        >
          Revoke
        </button>
      </div>
    </div>
  );
}

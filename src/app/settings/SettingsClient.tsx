"use client";

import { useState } from "react";

type QualityTier = "quick" | "balanced" | "maximum";

const QUALITY_OPTIONS: { id: QualityTier; name: string; desc: string }[] = [
  { id: "quick", name: "Quick", desc: "Fast scan, good for short notes" },
  { id: "balanced", name: "Balanced", desc: "Thorough analysis, best for most courses" },
  { id: "maximum", name: "Maximum", desc: "Deepest analysis with our most capable model" },
];

interface SettingsClientProps {
  email: string;
  name: string;
  plan: string;
  proAccessEndsAt: string | null;
  preferredQualityTier: string;
  hasPassword: boolean;
}

export function SettingsClient({
  email,
  name: initialName,
  plan,
  proAccessEndsAt,
  preferredQualityTier: initialTier,
  hasPassword,
}: SettingsClientProps) {
  const [name, setName] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [qualityTier, setQualityTier] = useState<QualityTier>(
    (initialTier === "quick" || initialTier === "maximum") ? initialTier : "balanced"
  );
  const [tierSaving, setTierSaving] = useState(false);
  const [tierMsg, setTierMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function saveName() {
    setNameSaving(true);
    setNameMsg(null);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setNameMsg({ type: "err", text: b.error ?? "Failed" });
      } else {
        setNameMsg({ type: "ok", text: "Saved" });
      }
    } catch {
      setNameMsg({ type: "err", text: "Network error" });
    } finally {
      setNameSaving(false);
    }
  }

  async function saveTier(tier: QualityTier) {
    setQualityTier(tier);
    setTierSaving(true);
    setTierMsg(null);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredQualityTier: tier }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setTierMsg({ type: "err", text: b.error ?? "Failed" });
      } else {
        setTierMsg({ type: "ok", text: "Saved" });
      }
    } catch {
      setTierMsg({ type: "err", text: "Network error" });
    } finally {
      setTierSaving(false);
    }
  }

  async function savePassword() {
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "err", text: "Passwords don't match" });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setPwMsg({ type: "err", text: b.error ?? "Failed" });
      } else {
        setPwMsg({ type: "ok", text: "Password updated" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPwMsg({ type: "err", text: "Network error" });
    } finally {
      setPwSaving(false);
    }
  }

  const cardStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 12,
    padding: 24,
    maxWidth: 480,
    marginBottom: 20,
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-dim)",
    marginBottom: 8,
  };

  const inputStyle = {
    width: "100%",
    padding: "11px 14px",
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    fontSize: 15,
    color: "var(--text)",
    fontFamily: "inherit",
    outline: "none",
    marginBottom: 12,
  };

  return (
    <>
      {/* Account section */}
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Account</div>

        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          readOnly
          style={{ ...inputStyle, color: "var(--text-faint)", cursor: "default" }}
        />

        <label style={labelStyle}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button
            onClick={saveName}
            disabled={nameSaving || name === initialName}
            style={{
              padding: "8px 20px",
              background: nameSaving || name === initialName ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: nameSaving || name === initialName ? "var(--text-dim)" : "var(--bg)",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: nameSaving || name === initialName ? "default" : "pointer",
            }}
          >
            {nameSaving ? "Saving…" : "Save name"}
          </button>
          {nameMsg && (
            <span style={{ fontSize: 13, color: nameMsg.type === "ok" ? "var(--accent)" : "var(--high)" }}>
              {nameMsg.text}
            </span>
          )}
        </div>

        <label style={labelStyle}>Plan</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 6,
              background: plan === "PRO" ? "linear-gradient(135deg, var(--accent), var(--accent-2))" : "var(--surface-2)",
              color: plan === "PRO" ? "var(--bg)" : "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {plan}
          </span>
          {proAccessEndsAt && (
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              Expires {new Date(proAccessEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          )}
          {plan === "FREE" && (
            <a href="/upgrade" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
              Upgrade →
            </a>
          )}
        </div>
      </div>

      {/* Password section */}
      {hasPassword && (
        <div style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Password</div>

          <label style={labelStyle}>Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={inputStyle}
          />

          <label style={labelStyle}>New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
            placeholder="Minimum 8 characters"
          />

          <label style={labelStyle}>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={savePassword}
              disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
              style={{
                padding: "8px 20px",
                background: pwSaving ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: pwSaving ? "var(--text-dim)" : "var(--bg)",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: pwSaving ? "default" : "pointer",
              }}
            >
              {pwSaving ? "Saving…" : "Update password"}
            </button>
            {pwMsg && (
              <span style={{ fontSize: 13, color: pwMsg.type === "ok" ? "var(--accent)" : "var(--high)" }}>
                {pwMsg.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Quality tier preference */}
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Default analysis quality</div>
        <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 16, lineHeight: 1.5 }}>
          New courses will default to this tier. You can still change it per course.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          {QUALITY_OPTIONS.map((opt) => {
            const selected = qualityTier === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => saveTier(opt.id)}
                disabled={tierSaving}
                style={{
                  flex: 1,
                  padding: "14px 12px",
                  borderRadius: 10,
                  border: selected ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
                  background: selected ? "var(--surface-2)" : "var(--surface)",
                  cursor: tierSaving ? "default" : "pointer",
                  transition: "all 0.15s",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: selected ? "var(--accent)" : "var(--text)", marginBottom: 4 }}>
                  {opt.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{opt.desc}</div>
              </button>
            );
          })}
        </div>
        {tierMsg && (
          <div style={{ marginTop: 10, fontSize: 13, color: tierMsg.type === "ok" ? "var(--accent)" : "var(--high)" }}>
            {tierMsg.text}
          </div>
        )}
      </div>
    </>
  );
}

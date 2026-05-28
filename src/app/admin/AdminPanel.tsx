"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  name: string | null;
  plan: "FREE" | "PRO";
  createdAt: string;
  _count: { courses: number };
}

interface CodeRedemption {
  redeemedAt: string;
  accessEndsAt: string;
  user: { email: string };
}

interface AccessCode {
  id: string;
  code: string;
  durationDays: number;
  maxUses: number;
  usedCount: number;
  codeExpiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdBy: string;
  createdAt: string;
  redemptions: CodeRedemption[];
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function togglePlan(user: User) {
    const newPlan = user.plan === "FREE" ? "PRO" : "FREE";
    setLoading(user.id);
    try {
      const res = await fetch("/api/admin/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, plan: newPlan }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, plan: newPlan } : u))
      );
      setToast(`${user.email} → ${newPlan}`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoading(null);
    }
  }

  const proCount = users.filter((u) => u.plan === "PRO").length;
  const freeCount = users.filter((u) => u.plan === "FREE").length;
  const totalCourses = users.reduce((s, u) => s + u._count.courses, 0);

  return (
    <>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
        {[
          { label: "Total Users", value: users.length, color: "var(--text)" },
          { label: "Pro", value: proCount, color: "var(--accent)" },
          { label: "Courses Created", value: totalCourses, color: "var(--accent-2)" },
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
              {["User", "Email", "Courses", "Joined", "Plan", "Action"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <tr key={user.id} style={{ borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none" }}>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {(user.name ?? user.email)[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                      {user.name ?? "—"}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-dim)" }}>{user.email}</td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--text)", textAlign: "center" }}>{user._count.courses}</td>
                <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--text-faint)" }}>
                  {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: user.plan === "PRO" ? "var(--accent-soft)" : "var(--surface-2)", color: user.plan === "PRO" ? "var(--accent)" : "var(--text-dim)", border: user.plan === "PRO" ? "1px solid var(--accent)" : "1px solid var(--border-strong)" }}>
                    {user.plan === "PRO" ? "✦ Pro" : "Free"}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <button
                    onClick={() => togglePlan(user)}
                    disabled={loading === user.id}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-strong)", background: loading === user.id ? "var(--surface-2)" : user.plan === "FREE" ? "var(--accent)" : "var(--surface-2)", color: user.plan === "FREE" && loading !== user.id ? "var(--bg)" : "var(--text-dim)", fontSize: 12, fontWeight: 600, cursor: loading === user.id ? "not-allowed" : "pointer", transition: "all 0.15s" }}
                  >
                    {loading === user.id ? "…" : user.plan === "FREE" ? "→ Pro" : "→ Free"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-faint)", textAlign: "right" }}>
        {freeCount} free · {proCount} pro · {users.length} total
      </p>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "12px 20px", fontSize: 13, color: "var(--text)", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", zIndex: 999 }}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}

// ── Access Codes tab ──────────────────────────────────────────────────────────

type CodeStatus = "Active" | "Inactive" | "Exhausted";

function codeStatus(c: AccessCode): CodeStatus {
  if (c.usedCount >= c.maxUses) return "Exhausted";
  if (!c.isActive) return "Inactive";
  return "Active";
}

const STATUS_STYLE: Record<CodeStatus, { bg: string; color: string }> = {
  Active:    { bg: "var(--accent-soft)",  color: "var(--accent)" },
  Inactive:  { bg: "var(--surface-2)",    color: "var(--text-dim)" },
  Exhausted: { bg: "rgba(255,107,107,0.1)", color: "var(--high, #ff6b6b)" },
};

function CodesTab() {
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Create form state
  const [duration, setDuration] = useState<3 | 5 | 10>(3);
  const [maxUses, setMaxUses] = useState(1);
  const [expiry, setExpiry] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  // Toggle / delete state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function loadCodes() {
    if (fetched) return;
    setLoadingCodes(true);
    try {
      const res = await fetch("/api/admin/codes");
      const data: AccessCode[] = res.ok ? await res.json() : [];
      setCodes(data);
      setFetched(true);
    } finally {
      setLoadingCodes(false);
    }
  }

  // Lazy-load on first render of this tab
  if (!fetched && !loadingCodes) {
    loadCodes();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationDays: duration,
          maxUses,
          codeExpiresAt: expiry || undefined,
          note: note || undefined,
        }),
      });
      const created: AccessCode = await res.json();
      if (!res.ok) throw new Error((created as unknown as { error: string }).error);
      setCodes((prev) => [{ ...created, redemptions: [] }, ...(prev ?? [])]);
      setNote("");
      setExpiry("");
      showToast(`Code ${created.code} created`);
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      setCodes((prev) =>
        prev?.map((c) => (c.id === id ? { ...c, isActive } : c)) ?? null
      );
      showToast(isActive ? "Code activated" : "Code deactivated");
    } catch {
      showToast("Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/codes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setCodes((prev) => prev?.filter((c) => c.id !== id) ?? null);
      setConfirmDelete(null);
      showToast("Code deleted");
    } catch {
      showToast("Delete failed");
    } finally {
      setActionLoading(null);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} copied`));
  }

  return (
    <>
      {/* Create form */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: "20px 24px", marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
          Generate New Code
        </h2>
        <form onSubmit={handleCreate}>
          {/* Duration toggle */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Duration</div>
            <div style={{ display: "flex", gap: 8 }}>
              {([3, 5, 10] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  style={{ padding: "7px 18px", borderRadius: 8, border: `1px solid ${duration === d ? "var(--accent)" : "var(--border-strong)"}`, background: duration === d ? "var(--accent-soft)" : "var(--surface-2)", color: duration === d ? "var(--accent)" : "var(--text-dim)", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 16, alignItems: "end" }}>
            {/* Max uses */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Max Uses</label>
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: "100%", padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>

            {/* Expiry */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Code Expires</label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>

            {/* Note */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Marketing batch May 2026"
                style={{ width: "100%", padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            style={{ padding: "9px 20px", background: creating ? "var(--surface-2)" : "var(--accent)", color: creating ? "var(--text-dim)" : "var(--bg)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer" }}
          >
            {creating ? "Generating…" : "Generate code"}
          </button>
        </form>
      </div>

      {/* Codes table */}
      {loadingCodes && (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading codes…</p>
      )}
      {!loadingCodes && codes !== null && codes.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-faint)" }}>No codes yet — generate one above.</p>
      )}
      {!loadingCodes && codes && codes.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                {["Code", "Link", "Duration", "Uses", "Code Expires", "Status", "Note", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.map((c, i) => {
                const status = codeStatus(c);
                const style = STATUS_STYLE[status];
                const isLast = i === codes.length - 1;
                const busy = actionLoading === c.id;
                const link = `https://cogni.futuresage.online/access?code=${c.code}`;

                return (
                  <tr key={c.id} style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>
                    {/* Code */}
                    <td style={{ padding: "14px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "0.08em" }}>
                          {c.code}
                        </span>
                        <button
                          onClick={() => copyToClipboard(c.code, "Code")}
                          title="Copy code"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 12, padding: "2px 4px", borderRadius: 4 }}
                        >
                          ⧉
                        </button>
                      </div>
                    </td>

                    {/* Link copy */}
                    <td style={{ padding: "14px 14px" }}>
                      <button
                        onClick={() => copyToClipboard(link, "Link")}
                        title="Copy invite link"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, cursor: "pointer", color: "var(--text-dim)", fontSize: 12, padding: "4px 10px", fontWeight: 600 }}
                      >
                        Copy link ⧉
                      </button>
                    </td>

                    {/* Duration */}
                    <td style={{ padding: "14px 14px", fontSize: 13, color: "var(--text)" }}>
                      {c.durationDays}d
                    </td>

                    {/* Uses */}
                    <td style={{ padding: "14px 14px", fontSize: 13, color: "var(--text)", fontFamily: "var(--font-jetbrains, monospace)" }}>
                      {c.usedCount} / {c.maxUses}
                    </td>

                    {/* Code expires */}
                    <td style={{ padding: "14px 14px", fontSize: 12, color: "var(--text-faint)" }}>
                      {c.codeExpiresAt
                        ? new Date(c.codeExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "Never"}
                    </td>

                    {/* Status badge */}
                    <td style={{ padding: "14px 14px" }}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", background: style.bg, color: style.color }}>
                        {status}
                      </span>
                    </td>

                    {/* Note */}
                    <td style={{ padding: "14px 14px", fontSize: 12, color: "var(--text-dim)", maxWidth: 160 }}>
                      {c.note ?? "—"}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "14px 14px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {status !== "Exhausted" && (
                          <button
                            onClick={() => handleToggle(c.id, !c.isActive)}
                            disabled={busy}
                            style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--text-dim)", fontSize: 11, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                          >
                            {busy ? "…" : c.isActive ? "Deactivate" : "Activate"}
                          </button>
                        )}

                        {confirmDelete === c.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(c.id)}
                              disabled={busy}
                              style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: "rgba(255,107,107,0.15)", color: "var(--high, #ff6b6b)", fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}
                            >
                              {busy ? "…" : "Delete"}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: "none", color: "var(--text-dim)", fontSize: 11, cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(c.id)}
                            style={{ padding: "5px 8px", borderRadius: 7, border: "none", background: "none", color: "var(--text-faint)", fontSize: 15, cursor: "pointer", lineHeight: 1 }}
                            title="Delete code"
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "12px 20px", fontSize: 13, color: "var(--text)", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", zIndex: 999 }}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}

// ── Root AdminPanel ───────────────────────────────────────────────────────────

export function AdminPanel({ initialUsers }: { initialUsers: User[] }) {
  const [activeTab, setActiveTab] = useState<"users" | "codes">("users");

  const tabs: { id: "users" | "codes"; label: string }[] = [
    { id: "users", label: "Users" },
    { id: "codes", label: "Access Codes" },
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 80px", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
          🛡 Admin
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
          {activeTab === "users" ? "User Management" : "Access Codes"}
        </h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              background: activeTab === t.id ? "var(--accent)" : "transparent",
              color: activeTab === t.id ? "var(--bg)" : "var(--text-dim)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "users" ? (
        <UsersTab initialUsers={initialUsers} />
      ) : (
        <CodesTab />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  plan: "FREE" | "PRO";
  createdAt: string;
  _count: { courses: number };
}

export function AdminPanel({ initialUsers }: { initialUsers: User[] }) {
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
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px", fontFamily: "inherit" }}>

      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
          🛡 Admin
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
          User Management
        </h1>
      </div>

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
              <tr
                key={user.id}
                style={{
                  borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none",
                  transition: "background 0.15s",
                }}
              >
                {/* Name */}
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "var(--accent-soft)", color: "var(--accent)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(user.name ?? user.email)[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                      {user.name ?? "—"}
                    </span>
                  </div>
                </td>

                {/* Email */}
                <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-dim)" }}>
                  {user.email}
                </td>

                {/* Courses */}
                <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--text)", textAlign: "center" }}>
                  {user._count.courses}
                </td>

                {/* Joined */}
                <td style={{ padding: "14px 16px", fontSize: 12, color: "var(--text-faint)" }}>
                  {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>

                {/* Plan badge */}
                <td style={{ padding: "14px 16px" }}>
                  <span style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    background: user.plan === "PRO" ? "var(--accent-soft)" : "var(--surface-2)",
                    color: user.plan === "PRO" ? "var(--accent)" : "var(--text-dim)",
                    border: user.plan === "PRO" ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
                  }}>
                    {user.plan === "PRO" ? "✦ Pro" : "Free"}
                  </span>
                </td>

                {/* Toggle button */}
                <td style={{ padding: "14px 16px" }}>
                  <button
                    onClick={() => togglePlan(user)}
                    disabled={loading === user.id}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border-strong)",
                      background: loading === user.id ? "var(--surface-2)" : user.plan === "FREE" ? "var(--accent)" : "var(--surface-2)",
                      color: user.plan === "FREE" && loading !== user.id ? "var(--bg)" : "var(--text-dim)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: loading === user.id ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {loading === user.id ? "…" : user.plan === "FREE" ? "→ Pro" : "→ Free"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Free count footer */}
      <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-faint)", textAlign: "right" }}>
        {freeCount} free · {proCount} pro · {users.length} total
      </p>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "var(--surface)", border: "1px solid var(--border-strong)",
          borderRadius: 10, padding: "12px 20px",
          fontSize: 13, color: "var(--text)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          zIndex: 999,
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

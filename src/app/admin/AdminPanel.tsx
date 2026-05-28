"use client";

import { useState, useMemo, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserCourse {
  id: string;
  name: string;
  status: "PROCESSING" | "READY" | "FAILED";
  createdAt: string;
  _count: { topics: number };
}

interface User {
  id: string;
  email: string;
  name: string | null;
  plan: "FREE" | "PRO";
  proAccessEndsAt: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  _count: { courses: number; redemptions: number };
  courses: UserCourse[];
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

interface AdminCourse {
  id: string;
  name: string;
  code: string | null;
  educationLevel: string | null;
  status: "PROCESSING" | "READY" | "FAILED";
  createdAt: string;
  updatedAt: string;
  totalPrepTimeMinutes: number | null;
  _count: { topics: number; files: number; chatMessages: number };
  user: { id: string; email: string; name: string | null };
}

interface Analytics {
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  totalCourses: number;
  readyCourses: number;
  failedCourses: number;
  processingCourses: number;
  recentSignups: number;
  signupsLast7d: number;
  coursesLast7d: number;
  recentActivity: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    user: { email: string; name: string | null };
  }[];
  signupsByDay: { day: string; count: number }[];
}

type TabId = "overview" | "users" | "courses" | "codes" | "models";

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div style={styles.toast}>
      {message}
    </div>
  );
}

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  function show(msg: string, ms = 3000) {
    setMessage(msg);
    setTimeout(() => setMessage(null), ms);
  }
  return { message, show };
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 340 }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 14, pointerEvents: "none" }}>
        &#x2315;
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "9px 12px 9px 34px",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          color: "var(--text)",
          fontSize: 13,
          boxSizing: "border-box",
          outline: "none",
        }}
      />
    </div>
  );
}

function FilterPill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 14px",
        borderRadius: 20,
        border: `1px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-dim)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {label}{count !== undefined ? ` (${count})` : ""}
    </button>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? "var(--accent-soft)" : "var(--surface)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: 14,
        padding: "18px 20px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: color ?? "var(--text)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6, fontWeight: 500 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    READY: { bg: "rgba(52,211,153,0.12)", color: "var(--success)" },
    PROCESSING: { bg: "rgba(251,191,36,0.12)", color: "var(--med)" },
    FAILED: { bg: "rgba(255,107,107,0.12)", color: "var(--high)" },
  };
  const s = map[status] ?? { bg: "var(--surface-2)", color: "var(--text-dim)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.05em",
        background: s.bg,
        color: s.color,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function PlanBadge({ plan }: { plan: "FREE" | "PRO" }) {
  const isPro = plan === "PRO";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        background: isPro ? "var(--accent-soft)" : "var(--surface-2)",
        color: isPro ? "var(--accent)" : "var(--text-dim)",
        border: isPro ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
      }}
    >
      {isPro ? "Pro" : "Free"}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-faint)", fontSize: 14 }}>
      {message}
    </div>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ users }: { users: User[] }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAnalytics(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading analytics...</p>;
  }

  if (!analytics) {
    return <p style={{ fontSize: 13, color: "var(--high)" }}>Failed to load analytics.</p>;
  }

  const maxBar = Math.max(...analytics.signupsByDay.map((d) => d.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        <StatCard label="Total Users" value={analytics.totalUsers} sub={`+${analytics.signupsLast7d} this week`} />
        <StatCard label="Pro Users" value={analytics.proUsers} color="var(--accent)" accent />
        <StatCard label="Free Users" value={analytics.freeUsers} />
        <StatCard label="Total Courses" value={analytics.totalCourses} sub={`+${analytics.coursesLast7d} this week`} />
        <StatCard label="Ready" value={analytics.readyCourses} color="var(--success)" />
        <StatCard label="Failed" value={analytics.failedCourses} color="var(--high)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Signup chart */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: "20px 24px" }}>
          <h3 style={styles.sectionTitle}>Signups — Last 30 Days</h3>
          {analytics.signupsByDay.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No signups yet.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, marginTop: 12 }}>
              {analytics.signupsByDay.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.count}`}
                  style={{
                    flex: 1,
                    minWidth: 4,
                    background: "var(--accent)",
                    borderRadius: "3px 3px 0 0",
                    height: `${Math.max((d.count / maxBar) * 100, 4)}%`,
                    opacity: 0.8,
                    transition: "height 0.3s ease",
                  }}
                />
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
              {analytics.signupsByDay[0]?.day ?? ""}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
              {analytics.signupsByDay[analytics.signupsByDay.length - 1]?.day ?? ""}
            </span>
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: "20px 24px" }}>
          <h3 style={styles.sectionTitle}>Recent Courses</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 8 }}>
            {analytics.recentActivity.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    {item.user.name ?? item.user.email}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <StatusBadge status={item.status} />
                  <span style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                    {formatRelative(item.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pro access expiring soon */}
      {(() => {
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const expiring = users.filter(
          (u) => u.proAccessEndsAt && new Date(u.proAccessEndsAt).getTime() - now < sevenDays && new Date(u.proAccessEndsAt).getTime() > now
        );
        if (expiring.length === 0) return null;
        return (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: "20px 24px" }}>
            <h3 style={styles.sectionTitle}>Pro Access Expiring Soon</h3>
            <div style={{ marginTop: 8 }}>
              {expiring.map((u) => (
                <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span style={{ color: "var(--text)" }}>{u.name ?? u.email}</span>
                  <span style={{ color: "var(--med)", fontSize: 12 }}>
                    Expires {formatDate(u.proAccessEndsAt!)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [loading, setLoading] = useState<string | null>(null);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"ALL" | "FREE" | "PRO">("ALL");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "courses">("newest");

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
      toast.show(`${user.email} set to ${newPlan}`);
    } catch (err) {
      toast.show(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(null);
    }
  }

  const filtered = useMemo(() => {
    let result = users;
    if (planFilter !== "ALL") {
      result = result.filter((u) => u.plan === planFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          (u.name ?? "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
    }
    if (sortBy === "oldest") {
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === "courses") {
      result = [...result].sort((a, b) => b._count.courses - a._count.courses);
    }
    return result;
  }, [users, planFilter, search, sortBy]);

  const proCount = users.filter((u) => u.plan === "PRO").length;

  return (
    <>
      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search users..." />
        <div style={{ display: "flex", gap: 6 }}>
          <FilterPill label="All" count={users.length} active={planFilter === "ALL"} onClick={() => setPlanFilter("ALL")} />
          <FilterPill label="Pro" count={proCount} active={planFilter === "PRO"} onClick={() => setPlanFilter("PRO")} />
          <FilterPill label="Free" count={users.length - proCount} active={planFilter === "FREE"} onClick={() => setPlanFilter("FREE")} />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={{
            padding: "6px 12px",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            color: "var(--text-dim)",
            fontSize: 12,
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="courses">Most courses</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState message={search ? "No users match your search." : "No users found."} />
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                {["User", "Email", "Courses", "Codes Used", "Joined", "Plan", "Action"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, i) => {
                const expanded = expandedUser === user.id;
                return (
                  <>
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: expanded ? "none" : i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                        cursor: "pointer",
                        background: expanded ? "var(--surface-2)" : "transparent",
                        transition: "background 0.15s",
                      }}
                      onClick={() => setExpandedUser(expanded ? null : user.id)}
                    >
                      <td style={styles.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={styles.avatar}>
                            {(user.name ?? user.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                              {user.name ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...styles.td, fontSize: 13, color: "var(--text-dim)" }}>{user.email}</td>
                      <td style={{ ...styles.td, fontSize: 13, color: "var(--text)", textAlign: "center" }}>{user._count.courses}</td>
                      <td style={{ ...styles.td, fontSize: 13, color: "var(--text)", textAlign: "center" }}>{user._count.redemptions}</td>
                      <td style={{ ...styles.td, fontSize: 12, color: "var(--text-faint)" }}>{formatDate(user.createdAt)}</td>
                      <td style={styles.td}>
                        <PlanBadge plan={user.plan} />
                      </td>
                      <td style={styles.td} onClick={(e) => e.stopPropagation()}>
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
                          {loading === user.id ? "..." : user.plan === "FREE" ? "Upgrade" : "Downgrade"}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${user.id}-detail`} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <td colSpan={7} style={{ padding: "0 16px 16px" }}>
                          <UserDetailPanel user={user} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)", textAlign: "right" }}>
        Showing {filtered.length} of {users.length} users
      </p>

      <Toast message={toast.message} />
    </>
  );
}

function UserDetailPanel({ user }: { user: User }) {
  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginTop: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Plan</div>
          <div style={{ fontSize: 14, color: "var(--text)", marginTop: 4 }}>{user.plan}</div>
        </div>
        {user.proAccessEndsAt && (
          <div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Pro Until</div>
            <div style={{ fontSize: 14, color: "var(--med)", marginTop: 4 }}>{formatDate(user.proAccessEndsAt)}</div>
          </div>
        )}
        {user.stripeSubscriptionId && (
          <div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Stripe</div>
            <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 4, fontFamily: "monospace" }}>
              {user.stripeSubscriptionId.slice(0, 16)}...
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Codes Used</div>
          <div style={{ fontSize: 14, color: "var(--text)", marginTop: 4 }}>{user._count.redemptions}</div>
        </div>
      </div>

      {user.courses.length > 0 ? (
        <>
          <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 8 }}>
            Recent Courses
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {user.courses.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "var(--surface)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{c.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{c._count.topics} topics</span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No courses created yet.</p>
      )}
    </div>
  );
}

// ── Courses tab ───────────────────────────────────────────────────────────────

function CoursesTab() {
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "READY" | "PROCESSING" | "FAILED">("ALL");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/courses")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCourses(data))
      .finally(() => setLoadingState(false));
  }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/courses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setCourses((prev) => prev?.filter((c) => c.id !== id) ?? null);
      setConfirmDelete(null);
      toast.show("Course deleted");
    } catch {
      toast.show("Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  if (loadingState) {
    return <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading courses...</p>;
  }

  const all = courses ?? [];
  const counts = {
    all: all.length,
    ready: all.filter((c) => c.status === "READY").length,
    processing: all.filter((c) => c.status === "PROCESSING").length,
    failed: all.filter((c) => c.status === "FAILED").length,
  };

  const filtered = all.filter((c) => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.code ?? "").toLowerCase().includes(q) ||
        c.user.email.toLowerCase().includes(q) ||
        (c.user.name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <>
      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search courses, users..." />
        <div style={{ display: "flex", gap: 6 }}>
          <FilterPill label="All" count={counts.all} active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
          <FilterPill label="Ready" count={counts.ready} active={statusFilter === "READY"} onClick={() => setStatusFilter("READY")} />
          <FilterPill label="Processing" count={counts.processing} active={statusFilter === "PROCESSING"} onClick={() => setStatusFilter("PROCESSING")} />
          <FilterPill label="Failed" count={counts.failed} active={statusFilter === "FAILED"} onClick={() => setStatusFilter("FAILED")} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message={search ? "No courses match your search." : "No courses yet."} />
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                {["Course", "Owner", "Status", "Topics", "Files", "Chats", "Created", ""].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((course, i) => (
                <tr key={course.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={styles.td}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{course.name}</div>
                    {course.code && (
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{course.code}</div>
                    )}
                  </td>
                  <td style={{ ...styles.td, fontSize: 13, color: "var(--text-dim)" }}>
                    {course.user.name ?? course.user.email}
                  </td>
                  <td style={styles.td}>
                    <StatusBadge status={course.status} />
                  </td>
                  <td style={{ ...styles.td, fontSize: 13, color: "var(--text)", textAlign: "center" }}>{course._count.topics}</td>
                  <td style={{ ...styles.td, fontSize: 13, color: "var(--text)", textAlign: "center" }}>{course._count.files}</td>
                  <td style={{ ...styles.td, fontSize: 13, color: "var(--text)", textAlign: "center" }}>{course._count.chatMessages}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "var(--text-faint)" }}>{formatRelative(course.createdAt)}</td>
                  <td style={styles.td}>
                    {confirmDelete === course.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handleDelete(course.id)}
                          disabled={deleting === course.id}
                          style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: "rgba(255,107,107,0.15)", color: "var(--high)", fontSize: 11, fontWeight: 700, cursor: deleting === course.id ? "not-allowed" : "pointer" }}
                        >
                          {deleting === course.id ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: "none", color: "var(--text-dim)", fontSize: 11, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(course.id)}
                        style={{ padding: "5px 8px", borderRadius: 7, border: "none", background: "none", color: "var(--text-faint)", fontSize: 13, cursor: "pointer" }}
                        title="Delete course"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)", textAlign: "right" }}>
        Showing {filtered.length} of {all.length} courses
      </p>

      <Toast message={toast.message} />
    </>
  );
}

// ── Access Codes tab ──────────────────────────────────────────────────────────

type CodeStatusLabel = "Active" | "Inactive" | "Exhausted";

function codeStatus(c: AccessCode): CodeStatusLabel {
  if (c.usedCount >= c.maxUses) return "Exhausted";
  if (!c.isActive) return "Inactive";
  return "Active";
}

const CODE_STATUS_STYLE: Record<CodeStatusLabel, { bg: string; color: string }> = {
  Active: { bg: "var(--accent-soft)", color: "var(--accent)" },
  Inactive: { bg: "var(--surface-2)", color: "var(--text-dim)" },
  Exhausted: { bg: "rgba(255,107,107,0.1)", color: "var(--high)" },
};

function CodesTab() {
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [fetched, setFetched] = useState(false);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Active" | "Inactive" | "Exhausted">("ALL");

  const [duration, setDuration] = useState<3 | 5 | 10 | 30>(3);
  const [maxUses, setMaxUses] = useState(1);
  const [expiry, setExpiry] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      toast.show(`Code ${created.code} created`);
    } catch (err) {
      toast.show(`Error: ${err instanceof Error ? err.message : String(err)}`);
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
      toast.show(isActive ? "Code activated" : "Code deactivated");
    } catch {
      toast.show("Action failed");
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
      toast.show("Code deleted");
    } catch {
      toast.show("Delete failed");
    } finally {
      setActionLoading(null);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.show(`${label} copied`));
  }

  const all = codes ?? [];
  const counts = {
    all: all.length,
    active: all.filter((c) => codeStatus(c) === "Active").length,
    inactive: all.filter((c) => codeStatus(c) === "Inactive").length,
    exhausted: all.filter((c) => codeStatus(c) === "Exhausted").length,
  };

  const filtered = all.filter((c) => {
    if (statusFilter !== "ALL" && codeStatus(c) !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.code.toLowerCase().includes(q) ||
        (c.note ?? "").toLowerCase().includes(q) ||
        c.createdBy.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <>
      {/* Create form */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: "20px 24px", marginBottom: 24 }}>
        <h2 style={styles.sectionTitle}>Generate New Code</h2>
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Duration</div>
            <div style={{ display: "flex", gap: 8 }}>
              {([3, 5, 10, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  style={{
                    padding: "7px 18px",
                    borderRadius: 8,
                    border: `1px solid ${duration === d ? "var(--accent)" : "var(--border-strong)"}`,
                    background: duration === d ? "var(--accent-soft)" : "var(--surface-2)",
                    color: duration === d ? "var(--accent)" : "var(--text-dim)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {d === 30 ? "1 month" : `${d} days`}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 16, alignItems: "end" }}>
            <div>
              <label style={styles.fieldLabel}>Max Uses</label>
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={styles.input}
              />
            </div>
            <div>
              <label style={styles.fieldLabel}>Code Expires</label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                style={styles.input}
              />
            </div>
            <div>
              <label style={styles.fieldLabel}>Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Marketing batch May 2026"
                style={styles.input}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            style={{
              padding: "9px 20px",
              background: creating ? "var(--surface-2)" : "var(--accent)",
              color: creating ? "var(--text-dim)" : "var(--bg)",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "Generating..." : "Generate code"}
          </button>
        </form>
      </div>

      {/* Controls */}
      {!loadingCodes && codes !== null && codes.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search codes..." />
          <div style={{ display: "flex", gap: 6 }}>
            <FilterPill label="All" count={counts.all} active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
            <FilterPill label="Active" count={counts.active} active={statusFilter === "Active"} onClick={() => setStatusFilter("Active")} />
            <FilterPill label="Inactive" count={counts.inactive} active={statusFilter === "Inactive"} onClick={() => setStatusFilter("Inactive")} />
            <FilterPill label="Exhausted" count={counts.exhausted} active={statusFilter === "Exhausted"} onClick={() => setStatusFilter("Exhausted")} />
          </div>
        </div>
      )}

      {/* Codes table */}
      {loadingCodes && (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading codes...</p>
      )}
      {!loadingCodes && codes !== null && codes.length === 0 && (
        <EmptyState message="No codes yet - generate one above." />
      )}
      {!loadingCodes && filtered.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                {["Code", "Link", "Duration", "Uses", "Expires", "Status", "Note", "Actions"].map((h) => (
                  <th key={h} style={{ ...styles.th, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const status = codeStatus(c);
                const statusStyle = CODE_STATUS_STYLE[status];
                const isLast = i === filtered.length - 1;
                const busy = actionLoading === c.id;
                const link = `https://cogni.futuresage.online/access?code=${c.code}`;

                return (
                  <tr key={c.id} style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "0.08em" }}>
                          {c.code}
                        </span>
                        <button
                          onClick={() => copyToClipboard(c.code, "Code")}
                          title="Copy code"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 12, padding: "2px 4px", borderRadius: 4 }}
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => copyToClipboard(link, "Link")}
                        title="Copy invite link"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, cursor: "pointer", color: "var(--text-dim)", fontSize: 12, padding: "4px 10px", fontWeight: 600 }}
                      >
                        Copy link
                      </button>
                    </td>
                    <td style={{ ...styles.td, fontSize: 13, color: "var(--text)" }}>{c.durationDays}d</td>
                    <td style={{ ...styles.td, fontSize: 13, color: "var(--text)", fontFamily: "var(--font-jetbrains, monospace)" }}>
                      {c.usedCount} / {c.maxUses}
                    </td>
                    <td style={{ ...styles.td, fontSize: 12, color: "var(--text-faint)" }}>
                      {c.codeExpiresAt ? formatDate(c.codeExpiresAt) : "Never"}
                    </td>
                    <td style={styles.td}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", background: statusStyle.bg, color: statusStyle.color }}>
                        {status}
                      </span>
                    </td>
                    <td style={{ ...styles.td, fontSize: 12, color: "var(--text-dim)", maxWidth: 160 }}>
                      {c.note ?? "—"}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {status !== "Exhausted" && (
                          <button
                            onClick={() => handleToggle(c.id, !c.isActive)}
                            disabled={busy}
                            style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--text-dim)", fontSize: 11, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                          >
                            {busy ? "..." : c.isActive ? "Deactivate" : "Activate"}
                          </button>
                        )}
                        {confirmDelete === c.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(c.id)}
                              disabled={busy}
                              style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: "rgba(255,107,107,0.15)", color: "var(--high)", fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}
                            >
                              {busy ? "..." : "Delete"}
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
                            style={{ padding: "5px 8px", borderRadius: 7, border: "none", background: "none", color: "var(--text-faint)", fontSize: 13, cursor: "pointer" }}
                            title="Delete code"
                          >
                            Delete
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

      {!loadingCodes && codes !== null && codes.length > 0 && (
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)", textAlign: "right" }}>
          Showing {filtered.length} of {all.length} codes
        </p>
      )}

      <Toast message={toast.message} />
    </>
  );
}

// ── Models Tab ───────────────────────────────────────────────────────────────

interface AdminModel {
  id: string;
  modelId: string;
  label: string;
  desc: string;
  provider: string;
  tier: "FREE" | "PRO";
  isActive: boolean;
  sortOrder: number;
}

function ModelsTab() {
  const [models, setModels] = useState<AdminModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: "", desc: "", provider: "", tier: "FREE" as "FREE" | "PRO" });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ modelId: "", label: "", desc: "", provider: "", tier: "FREE" as "FREE" | "PRO" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/models")
      .then((r) => r.json())
      .then((data) => setModels(data))
      .catch(() => toast.show("Failed to load models"))
      .finally(() => setLoading(false));
  }, []);

  async function toggleTier(m: AdminModel) {
    const newTier = m.tier === "FREE" ? "PRO" : "FREE";
    const res = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: m.id, tier: newTier }),
    });
    if (res.ok) {
      setModels((prev) => prev?.map((x) => (x.id === m.id ? { ...x, tier: newTier } : x)) ?? null);
      toast.show(`${m.label} → ${newTier}`);
    }
  }

  async function toggleActive(m: AdminModel) {
    const res = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: m.id, isActive: !m.isActive }),
    });
    if (res.ok) {
      setModels((prev) => prev?.map((x) => (x.id === m.id ? { ...x, isActive: !x.isActive } : x)) ?? null);
      toast.show(`${m.label} ${m.isActive ? "disabled" : "enabled"}`);
    }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const res = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...editForm }),
    });
    if (res.ok) {
      setModels((prev) =>
        prev?.map((x) => (x.id === id ? { ...x, ...editForm } : x)) ?? null
      );
      setEditId(null);
      toast.show("Saved");
    }
    setSaving(false);
  }

  async function addModel() {
    if (!addForm.modelId || !addForm.label || !addForm.provider) return;
    setSaving(true);
    const res = await fetch("/api/admin/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (res.ok) {
      const created: AdminModel = await res.json();
      setModels((prev) => [...(prev ?? []), created]);
      setAddForm({ modelId: "", label: "", desc: "", provider: "", tier: "FREE" });
      setShowAdd(false);
      toast.show("Model added");
    }
    setSaving(false);
  }

  async function deleteModel(m: AdminModel) {
    if (!confirm(`Delete "${m.label}"?`)) return;
    const res = await fetch(`/api/admin/models?id=${m.id}`, { method: "DELETE" });
    if (res.ok) {
      setModels((prev) => prev?.filter((x) => x.id !== m.id) ?? null);
      toast.show("Deleted");
    }
  }

  if (loading || !models) return <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Loading models...</p>;

  const freeCount = models.filter((m) => m.tier === "FREE" && m.isActive).length;
  const proCount = models.filter((m) => m.tier === "PRO" && m.isActive).length;

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: "14px 20px", flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Free Models</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>{freeCount}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: "14px 20px", flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pro Models</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>{proCount}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: "14px 20px", flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>{models.length}</div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={styles.sectionTitle}>All Models</h2>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            {showAdd ? "Cancel" : "+ Add Model"}
          </button>
        </div>

        {showAdd && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto auto", gap: 8, marginBottom: 16, alignItems: "end" }}>
            <div>
              <label style={styles.fieldLabel}>Model ID</label>
              <input style={styles.input} placeholder="e.g. gpt-4o" value={addForm.modelId} onChange={(e) => setAddForm({ ...addForm, modelId: e.target.value })} />
            </div>
            <div>
              <label style={styles.fieldLabel}>Label</label>
              <input style={styles.input} placeholder="Display name" value={addForm.label} onChange={(e) => setAddForm({ ...addForm, label: e.target.value })} />
            </div>
            <div>
              <label style={styles.fieldLabel}>Provider</label>
              <input style={styles.input} placeholder="e.g. OpenAI" value={addForm.provider} onChange={(e) => setAddForm({ ...addForm, provider: e.target.value })} />
            </div>
            <div>
              <label style={styles.fieldLabel}>Description</label>
              <input style={styles.input} placeholder="Short desc" value={addForm.desc} onChange={(e) => setAddForm({ ...addForm, desc: e.target.value })} />
            </div>
            <div>
              <label style={styles.fieldLabel}>Tier</label>
              <select
                style={{ ...styles.input, height: 36 }}
                value={addForm.tier}
                onChange={(e) => setAddForm({ ...addForm, tier: e.target.value as "FREE" | "PRO" })}
              >
                <option value="FREE">Free</option>
                <option value="PRO">Pro</option>
              </select>
            </div>
            <button
              onClick={addModel}
              disabled={saving || !addForm.modelId || !addForm.label || !addForm.provider}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--bg)", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.5 : 1, height: 36 }}
            >
              Add
            </button>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                <th style={styles.th}>Label</th>
                <th style={styles.th}>Model ID</th>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Tier</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--border)", opacity: m.isActive ? 1 : 0.4 }}>
                  {editId === m.id ? (
                    <>
                      <td style={styles.td}>
                        <input style={{ ...styles.input, width: 160 }} value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} />
                      </td>
                      <td style={{ ...styles.td, fontSize: 12, color: "var(--text-dim)", fontFamily: "monospace" }}>{m.modelId}</td>
                      <td style={styles.td}>
                        <input style={{ ...styles.input, width: 100 }} value={editForm.provider} onChange={(e) => setEditForm({ ...editForm, provider: e.target.value })} />
                      </td>
                      <td style={styles.td}>
                        <select style={{ ...styles.input, width: 80 }} value={editForm.tier} onChange={(e) => setEditForm({ ...editForm, tier: e.target.value as "FREE" | "PRO" })}>
                          <option value="FREE">Free</option>
                          <option value="PRO">Pro</option>
                        </select>
                      </td>
                      <td style={styles.td}>—</td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => saveEdit(m.id)} disabled={saving} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--accent)", color: "var(--bg)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Save</button>
                          <button onClick={() => setEditId(null)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-dim)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={styles.td}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{m.desc}</div>
                      </td>
                      <td style={{ ...styles.td, fontSize: 12, color: "var(--text-dim)", fontFamily: "monospace" }}>{m.modelId}</td>
                      <td style={{ ...styles.td, fontSize: 13, color: "var(--text)" }}>{m.provider}</td>
                      <td style={styles.td}>
                        <button
                          onClick={() => toggleTier(m)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 20,
                            border: "none",
                            background: m.tier === "FREE" ? "var(--accent-soft)" : "rgba(168, 85, 247, 0.15)",
                            color: m.tier === "FREE" ? "var(--accent)" : "#a855f7",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {m.tier}
                        </button>
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => toggleActive(m)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 20,
                            border: "none",
                            background: m.isActive ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                            color: m.isActive ? "#22c55e" : "#ef4444",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {m.isActive ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => { setEditId(m.id); setEditForm({ label: m.label, desc: m.desc, provider: m.provider, tier: m.tier }); }}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-dim)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteModel(m)}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(239, 68, 68, 0.3)", background: "transparent", color: "#ef4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Toast message={toast.message} />
    </>
  );
}

// ── Root AdminPanel ───────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◐" },
  { id: "users", label: "Users", icon: "◉" },
  { id: "courses", label: "Courses", icon: "▦" },
  { id: "codes", label: "Access Codes", icon: "⚿" },
  { id: "models", label: "AI Models", icon: "◈" },
];

export function AdminPanel({ initialUsers }: { initialUsers: User[] }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
          Admin
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
          {TABS.find((t) => t.id === activeTab)?.label}
        </h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {TABS.map((t) => (
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
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab users={initialUsers} />}
      {activeTab === "users" && <UsersTab initialUsers={initialUsers} />}
      {activeTab === "courses" && <CoursesTab />}
      {activeTab === "codes" && <CodesTab />}
      {activeTab === "models" && <ModelsTab />}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const styles = {
  th: {
    padding: "12px 16px",
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  td: {
    padding: "14px 16px",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  toast: {
    position: "fixed" as const,
    bottom: 24,
    right: 24,
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    padding: "12px 20px",
    fontSize: 13,
    color: "var(--text)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    zIndex: 999,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    margin: 0,
  },
  fieldLabel: {
    display: "block" as const,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-faint)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 14,
    boxSizing: "border-box" as const,
  },
};

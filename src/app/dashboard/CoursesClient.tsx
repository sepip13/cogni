"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CourseListItem {
  id: string;
  name: string;
  code: string | null;
  examDate: string | null;
  status: "PROCESSING" | "READY" | "FAILED";
  totalPrepTimeMinutes: number | null;
  updatedAt: string;
  topics: Array<{ id: string; studied: boolean }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_BADGE: Record<
  CourseListItem["status"],
  { bg: string; color: string; label: string }
> = {
  READY:      { bg: "rgba(52,211,153,0.12)", color: "var(--success)", label: "Ready" },
  PROCESSING: { bg: "rgba(124,92,255,0.12)", color: "var(--accent)",  label: "Processing…" },
  FAILED:     { bg: "rgba(255,107,107,0.12)", color: "var(--high)",   label: "Failed" },
};

// ── Due-this-week banner (cross-course deliverables; in-app reminder) ──────────

interface UpcomingItem {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  weight: number | null;
  dueDate: string;
  daysUntilDue: number;
}

function dueLabel(days: number): { text: string; color: string } {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: "var(--high)" };
  if (days === 0) return { text: "due today", color: "var(--high)" };
  if (days === 1) return { text: "due tomorrow", color: "var(--med)" };
  return { text: `due in ${days}d`, color: days <= 7 ? "var(--med)" : "var(--text-dim)" };
}

function DueThisWeekBanner() {
  const [items, setItems] = useState<UpcomingItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/deliverables/upcoming")
      .then((r) => (r.ok ? (r.json() as Promise<{ items: UpcomingItem[] }>) : Promise.reject()))
      .then((d) => {
        if (alive) setItems(d.items);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 24,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-faint)", marginBottom: 10 }}>
        Due soon
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => {
          const due = dueLabel(it.daysUntilDue);
          return (
            <Link
              key={it.id}
              href={`/courses/${it.courseId}#assignment-buddy`}
              className="hover-text"
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text)", textDecoration: "none", flexWrap: "wrap" }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: due.color, flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>{it.title}</span>
              <span style={{ color: "var(--text-faint)" }}>· {it.courseName}</span>
              {it.weight != null && <span style={{ color: "var(--text-faint)" }}>· {it.weight}%</span>}
              <span style={{ color: due.color, fontWeight: 600, marginLeft: "auto" }}>{due.text}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: 140, marginBottom: 32 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 160, borderRadius: 14 }} />
        ))}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div
        style={{
          width: 64,
          height: 64,
          background: "var(--accent-soft)",
          borderRadius: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
        aria-hidden="true"
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M4 6h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="url(#emptyGrad)" strokeWidth="1.5" />
          <path d="M8 10h8M8 14h6" stroke="url(#emptyGrad)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M22 9l4-3v16l-4-3" stroke="url(#emptyGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="23" cy="5" r="2" fill="var(--accent-2)" opacity="0.6" />
          <defs>
            <linearGradient id="emptyGrad" x1="2" y1="6" x2="26" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="var(--accent)" />
              <stop offset="1" stopColor="var(--accent-2)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.02em" }}>
        No courses yet
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 28, maxWidth: 340, margin: "0 auto 28px" }}>
        Upload your syllabus, slides, and rubric — Cogni will build you a ranked study plan in under 90 seconds.
      </p>
      <Link
        href="/courses/new"
        style={{
          display: "inline-block",
          padding: "13px 28px",
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: "var(--bg)",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        Upload your first course →
      </Link>
    </div>
  );
}

// ── Course card ───────────────────────────────────────────────────────────────

function CourseCard({
  course,
  onDelete,
}: {
  course: CourseListItem;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const studiedCount = course.topics.filter((t) => t.studied).length;
  const totalTopics = course.topics.length;
  const progressPct = totalTopics > 0 ? Math.round((studiedCount / totalTopics) * 100) : 0;
  const days = daysUntil(course.examDate);
  const badge = STATUS_BADGE[course.status];

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Delete failed (${res.status})`);
      }
      onDelete(course.id);
    } catch {
      alert("Could not delete the course. Please try again.");
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        transition: "border-color 0.15s",
        position: "relative",
      }}
      className="hover-border"
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <Link
              href={`/courses/${course.id}`}
              style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", textDecoration: "none", color: "var(--text)" }}
            >
              {course.name}
            </Link>
            {course.code && (
              <span style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--text-faint)" }}>
                {course.code}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 700,
                background: badge.bg,
                color: badge.color,
              }}
            >
              {badge.label}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Updated {fmtRelative(course.updatedAt)}
            </span>
          </div>
        </div>

        {/* Kebab menu */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          {!confirming ? (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={{ color: "var(--text-faint)", fontSize: 18, padding: "2px 6px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.1em" }}
              aria-label={`Options for ${course.name}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              ···
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ fontSize: 11, fontWeight: 700, color: "var(--high)", cursor: "pointer", padding: "3px 8px", background: "rgba(255,107,107,0.1)", borderRadius: 5 }}
              >
                {deleting ? "…" : "Delete"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                style={{ fontSize: 11, color: "var(--text-dim)", cursor: "pointer", padding: "3px 8px" }}
              >
                Cancel
              </button>
            </div>
          )}
          {menuOpen && !confirming && (
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 4px)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 4,
                minWidth: 140,
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                zIndex: 10,
              }}
            >
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 13, color: "var(--text-dim)", borderRadius: 6, cursor: "default", opacity: 0.5 }}
                disabled
              >
                Re-analyze
              </button>
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 13, color: "var(--text-dim)", borderRadius: 6, cursor: "default", opacity: 0.5 }}
                disabled
              >
                Duplicate
              </button>
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); setConfirming(true); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 13, color: "var(--high)", borderRadius: 6, cursor: "pointer" }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 20, fontSize: 12, color: "var(--text-dim)" }}>
        {course.totalPrepTimeMinutes != null && (
          <span>{fmtMinutes(course.totalPrepTimeMinutes)} prep</span>
        )}
        {totalTopics > 0 && (
          <span>{totalTopics} topics</span>
        )}
        {days !== null && (
          <span style={{ color: days <= 3 ? "var(--high)" : days <= 7 ? "var(--med)" : "var(--text-dim)", fontWeight: days <= 7 ? 600 : 400 }}>
            {days <= 0 ? "exam today" : days === 1 ? "exam tomorrow" : `${days}d left`}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalTopics > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-faint)", marginBottom: 5 }}>
            <span>Progress</span>
            <span style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{studiedCount}/{totalTopics}</span>
          </div>
          <div
            style={{ height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progressPct}% studied`}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: progressPct === 100 ? "var(--success)" : "linear-gradient(90deg, var(--accent), var(--accent-2))",
                borderRadius: 3,
                transition: "width 0.5s",
              }}
            />
          </div>
        </div>
      )}

      {/* CTA */}
      <Link
        href={`/courses/${course.id}`}
        style={{
          display: "block",
          textAlign: "center",
          padding: "9px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text)",
          textDecoration: "none",
          transition: "border-color 0.15s",
        }}
        className="hover-text"
      >
        {course.status === "READY" ? "Open study plan →" : course.status === "PROCESSING" ? "View progress →" : "See details →"}
      </Link>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CoursesClient({
  userName,
  accessGranted = false,
  accessUntil = null,
}: {
  userName: string | null;
  accessGranted?: boolean;
  accessUntil?: string | null;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [showBanner, setShowBanner] = useState(accessGranted);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  function handleDelete(id: string) {
    setCourses((prev) => prev?.filter((c) => c.id !== id) ?? []);
  }

  if (courses === null) return <DashboardSkeleton />;

  const untilFormatted = accessUntil
    ? new Date(accessUntil).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="fade-in">
      {/* Access granted banner */}
      {showBanner && (
        <div
          style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            borderRadius: 12,
            padding: "12px 20px",
            marginBottom: 24,
            fontSize: 14,
            color: "var(--accent)",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>
            ✦ Pro access activated{untilFormatted ? ` — expires ${untilFormatted}` : ""}
          </span>
          <button
            onClick={() => setShowBanner(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: 16,
              padding: "0 4px",
              lineHeight: 1,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Cross-course deadline reminders (in-app only) */}
      <DueThisWeekBanner />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em", marginBottom: 4 }}>
            {userName ? `Hey, ${userName.split(" ")[0]}` : "My courses"}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)" }}>
            {courses.length === 0
              ? "No courses yet — upload your first one."
              : (() => {
                  const totalMinutes = courses.reduce((s, c) => s + (c.totalPrepTimeMinutes ?? 0), 0);
                  const totalHours = Math.floor(totalMinutes / 60);
                  const nearestExam = courses
                    .map((c) => daysUntil(c.examDate))
                    .filter((d): d is number => d !== null && d > 0)
                    .sort((a, b) => a - b)[0];
                  const parts = [`${courses.length} course${courses.length === 1 ? "" : "s"}`];
                  if (totalHours > 0) parts.push(`${totalHours}h total study time`);
                  if (nearestExam !== undefined) parts.push(`next exam in ${nearestExam}d`);
                  return parts.join(" · ");
                })()}
          </p>
        </div>
        <Link
          href="/courses/new"
          style={{
            padding: "10px 20px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: "#0a0e1a",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          + New course
        </Link>
      </div>

      {courses.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="fade-up-stagger"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

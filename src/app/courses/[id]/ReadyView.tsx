"use client";

import Link from "next/link";
import type { CourseData } from "./types";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function PriorityChip({
  priority,
  label,
}: {
  priority: "HIGH" | "MED" | "LOW";
  label: string;
}) {
  const colors: Record<"HIGH" | "MED" | "LOW", { bg: string; text: string; border: string }> = {
    HIGH: { bg: "rgba(255,107,107,0.12)", text: "var(--high)", border: "rgba(255,107,107,0.3)" },
    MED: { bg: "rgba(251,191,36,0.12)", text: "var(--med)", border: "rgba(251,191,36,0.25)" },
    LOW: { bg: "rgba(96,165,250,0.12)", text: "var(--low)", border: "rgba(96,165,250,0.25)" },
  };
  const c = colors[priority];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

export function ReadyView({ course }: { course: CourseData }) {
  const studiedCount = course.topics.filter((t) => t.studied).length;
  const totalTopics = course.topics.length;
  const progressPct =
    totalTopics > 0 ? Math.round((studiedCount / totalTopics) * 100) : 0;
  const days = daysUntil(course.examDate);
  const totalPrep = course.totalPrepTimeMinutes ?? 0;

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--text-dim)",
          marginBottom: 24,
        }}
      >
        <Link href="/dashboard" style={{ color: "var(--text-dim)", transition: "color 0.15s" }}>
          My courses
        </Link>
        <span style={{ color: "var(--text-faint)" }} aria-hidden="true">›</span>
        <span style={{ color: "var(--text)" }} aria-current="page">
          {course.name}
        </span>
      </nav>

      {/* Header row — flex-wrap lets buttons stack below the title on narrow screens */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          marginBottom: 28,
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.2,
              marginBottom: 8,
            }}
          >
            {course.name}
            {course.code && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                {course.code}
              </span>
            )}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)" }}>
            {totalTopics} topics · {fmtMinutes(totalPrep)} total prep
            {days !== null && (
              <>
                {" "}·{" "}
                <span
                  style={{
                    color:
                      days <= 3
                        ? "var(--high)"
                        : days <= 7
                        ? "var(--med)"
                        : "var(--text-dim)",
                    fontWeight: days <= 7 ? 600 : 400,
                  }}
                >
                  {days <= 0
                    ? "exam today!"
                    : days === 1
                    ? "exam tomorrow"
                    : `${days} days until exam`}
                </span>
              </>
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={`/courses/${course.id}/chat`}
            style={{
              padding: "9px 18px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              transition: "border-color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            Ask Cogni
          </Link>
          <a
            href={`/api/courses/${course.id}/export`}
            download
            style={{
              padding: "9px 18px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              transition: "border-color 0.15s",
              whiteSpace: "nowrap",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* KPI grid — auto-fill collapses to 2×2 on mobile, 4×1 on desktop */}
      <div
        className="fade-up-stagger"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {(
          [
            {
              label: "Topics",
              value: totalTopics.toString(),
              sub: `${course.topics.filter((t) => t.priority === "HIGH").length} high priority`,
            },
            {
              label: "Prep time",
              value: fmtMinutes(totalPrep),
              sub: `${fmtMinutes(Math.ceil(totalPrep / (totalTopics || 1)))} avg / topic`,
            },
            {
              label: "Progress",
              value: `${progressPct}%`,
              sub: `${studiedCount} of ${totalTopics} studied`,
            },
            {
              label: days !== null ? "Days left" : "Exam date",
              value:
                days !== null ? (days <= 0 ? "0" : days.toString()) : "—",
              sub:
                days !== null
                  ? days <= 0
                    ? "Good luck! 🎯"
                    : "until exam"
                  : "Not set",
            },
          ] as { label: string; value: string; sub: string }[]
        ).map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-faint)",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 4,
              }}
            >
              {kpi.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {totalTopics > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            Overall progress
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: "var(--surface-2)",
              borderRadius: 4,
              overflow: "hidden",
            }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progressPct}% of topics studied`}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background:
                  progressPct === 100
                    ? "var(--success)"
                    : "linear-gradient(90deg, var(--accent), var(--accent-2))",
                borderRadius: 4,
                transition: "width 0.5s var(--ease-out-expo)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-jetbrains), monospace",
              color: "var(--text-dim)",
              flexShrink: 0,
            }}
          >
            {studiedCount}/{totalTopics}
          </span>
        </div>
      )}

      {/* Study plan heading */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em" }}>
            Study plan
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
            Ranked by exam impact · highest priority first
          </p>
        </div>
        <Link
          href={`/courses/${course.id}/calendar`}
          style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}
        >
          View calendar →
        </Link>
      </div>

      {/* Topics list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {course.topics.map((topic) => (
          <Link
            key={topic.id}
            href={`/courses/${course.id}/topics/${topic.id}`}
            style={{
              background: "var(--surface)",
              border: `1px solid ${topic.studied ? "rgba(52,211,153,0.25)" : "var(--border)"}`,
              borderRadius: 14,
              padding: "18px 22px",
              display: "grid",
              gridTemplateColumns: "36px 1fr auto auto",
              gap: 16,
              alignItems: "center",
              transition: "border-color 0.15s, background 0.15s",
              textDecoration: "none",
              color: "inherit",
            }}
            className="hover-card"
          >
            <span
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 13,
                color: "var(--text-faint)",
                userSelect: "none",
              }}
              aria-hidden="true"
            >
              {topic.num}
            </span>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 4,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    opacity: topic.studied ? 0.6 : 1,
                    textDecoration: topic.studied ? "line-through" : "none",
                  }}
                >
                  {topic.title}
                </span>
                <PriorityChip priority={topic.priority} label={topic.priorityLabel} />
                {topic.studied && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--success)",
                      background: "rgba(52,211,153,0.1)",
                      border: "1px solid rgba(52,211,153,0.3)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Done
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {topic.why}
              </p>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                {fmtMinutes(topic.timeMinutes)}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                est.
              </div>
            </div>

            <span style={{ color: "var(--text-faint)", fontSize: 16 }} aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

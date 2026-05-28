"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CalendarDay } from "@/app/api/courses/[id]/calendar/route";

const PRIORITY_DOT: Record<"HIGH" | "MED" | "LOW", string> = {
  HIGH: "var(--high)",
  MED: "var(--med)",
  LOW: "var(--low)",
};

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function CalendarView({ courseId }: { courseId: string }) {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [examDate, setExamDate] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [loading, setLoading] = useState(true);
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/courses/${courseId}/calendar`).then((r) => r.json()),
      fetch(`/api/courses/${courseId}`).then((r) => r.json()),
    ]).then(([cal, course]) => {
      setCalendar(cal.calendar ?? []);
      setExamDate(cal.examDate ?? null);
      setCourseName(course.name ?? "");
    }).finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    if (!loading && todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading]);

  if (loading) {
    return (
      <div style={{ paddingTop: 32 }} aria-busy="true">
        <div className="skeleton" style={{ height: 20, width: 180, marginBottom: 24 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 120, borderRadius: 14, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)", marginBottom: 24 }}
      >
        <Link href="/dashboard" style={{ color: "var(--text-dim)" }}>My courses</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <Link href={`/courses/${courseId}`} style={{ color: "var(--text-dim)" }}>{courseName}</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <span style={{ color: "var(--text)" }} aria-current="page">Study calendar</span>
      </nav>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Study calendar</h1>
        {examDate && (
          <span
            style={{
              fontSize: 13,
              fontFamily: "var(--font-jetbrains), monospace",
              color: "var(--text-dim)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              padding: "4px 10px",
              borderRadius: 6,
            }}
          >
            Exam: {new Date(examDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </div>

      {calendar.length === 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "40px 24px",
            textAlign: "center",
            color: "var(--text-dim)",
          }}
        >
          No topics to schedule yet. Set an exam date and make sure topics are ready.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {calendar.map((day) => (
          <div
            key={day.date}
            ref={day.isToday ? todayRef : undefined}
            style={{
              background: day.isToday ? "var(--surface-2)" : "var(--surface)",
              border: `1px solid ${day.isToday ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 14,
              padding: "18px 22px",
              position: "relative",
            }}
          >
            {/* Day header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: day.topics.length > 0 ? 12 : 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{day.dayLabel}</span>
                {day.isToday && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--accent)",
                      background: "var(--accent-soft)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Today
                  </span>
                )}
              </div>
              {day.totalMinutes > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontWeight: 700,
                    color: "var(--accent)",
                    background: "var(--accent-soft)",
                    padding: "3px 10px",
                    borderRadius: 6,
                  }}
                >
                  {fmtMinutes(day.totalMinutes)}
                </span>
              )}
            </div>

            {/* Topics for this day */}
            {day.topics.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {day.topics.map((t) => (
                  <Link
                    key={t.id}
                    href={`/courses/${courseId}/topics/${t.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      background: t.studied ? "rgba(52,211,153,0.06)" : "var(--bg-2, var(--surface-2))",
                      border: `1px solid ${t.studied ? "rgba(52,211,153,0.2)" : "transparent"}`,
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "inherit",
                      transition: "border-color 0.15s",
                    }}
                    className="hover-accent-border"
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: PRIORITY_DOT[t.priority],
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: 500,
                        opacity: t.studied ? 0.6 : 1,
                        textDecoration: t.studied ? "line-through" : "none",
                      }}
                    >
                      {t.num} {t.title}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains), monospace",
                        fontSize: 11,
                        color: "var(--text-faint)",
                        flexShrink: 0,
                      }}
                    >
                      {fmtMinutes(t.timeMinutes)}
                    </span>
                    {t.studied && (
                      <span style={{ fontSize: 12, color: "var(--success)", flexShrink: 0 }}>✓</span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>
                Rest day
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

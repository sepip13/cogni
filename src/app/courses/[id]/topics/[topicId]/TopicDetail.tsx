"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Subtopic {
  text: string;
  time_minutes: number;
}

interface PracticeQuestion {
  q: string;
  source: string;
  expected_answer: string;
}

interface SourceRef {
  name: string;
  page: string;
}

interface SourceFile {
  id: string;
  fileName: string;
  fileType: string;
  blobUrl: string;
  pageCount: number | null;
}

interface TopicData {
  id: string;
  num: string;
  title: string;
  priority: "HIGH" | "MED" | "LOW";
  priorityLabel: string;
  why: string;
  timeMinutes: number;
  pages: string | null;
  subtopics: Subtopic[];
  practiceQuestions: PracticeQuestion[];
  sources: SourceRef[];
  studied: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const PRIORITY_STYLES: Record<"HIGH" | "MED" | "LOW", { bg: string; color: string; border: string }> = {
  HIGH: { bg: "rgba(255,107,107,0.12)", color: "var(--high)", border: "rgba(255,107,107,0.3)" },
  MED:  { bg: "rgba(251,191,36,0.12)",  color: "var(--med)",  border: "rgba(251,191,36,0.25)" },
  LOW:  { bg: "rgba(96,165,250,0.12)",  color: "var(--low)",  border: "rgba(96,165,250,0.25)" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TopicDetail({
  courseId,
  topicId,
}: {
  courseId: string;
  topicId: string;
}) {
  const [topic, setTopic] = useState<TopicData | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [courseName, setCourseName] = useState("");
  const [error, setError] = useState(false);
  const [togglingStudied, setTogglingStudied] = useState(false);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/topics/${topicId}`)
      .then((r) => {
        if (!r.ok) { setError(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setTopic(data.topic);
        setSourceFiles(data.sourceFiles);
        setCourseName(data.courseName);
      })
      .catch(() => setError(true));
  }, [courseId, topicId]);

  async function toggleStudied() {
    if (!topic) return;
    setTogglingStudied(true);
    try {
      const res = await fetch(
        `/api/courses/${courseId}/topics/${topicId}/studied`,
        { method: "PATCH" }
      );
      if (res.ok) {
        const { studied } = await res.json();
        setTopic((prev) => (prev ? { ...prev, studied } : prev));
      }
    } finally {
      setTogglingStudied(false);
    }
  }

  // Map source name → SourceFile for building links
  function resolveSourceFile(name: string): SourceFile | undefined {
    return sourceFiles.find(
      (f) => f.fileName.toLowerCase() === name.toLowerCase()
    );
  }

  // §11 hard constraint: don't render a clickable link if cited page > pageCount
  function isPageValid(file: SourceFile, pageStr: string): boolean {
    if (file.pageCount === null) return true;
    const page = parseInt(pageStr, 10);
    if (isNaN(page)) return true;
    return page <= file.pageCount;
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
        Topic not found.{" "}
        <Link href={`/courses/${courseId}`} style={{ color: "var(--accent)" }}>
          Back to course
        </Link>
      </div>
    );
  }

  if (!topic) {
    return (
      <div style={{ paddingTop: 32 }} aria-busy="true">
        <div className="skeleton" style={{ height: 20, width: 140, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 14, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />
      </div>
    );
  }

  const ps = PRIORITY_STYLES[topic.priority];

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
        <span style={{ color: "var(--text)" }} aria-current="page">{topic.title}</span>
      </nav>

      {/* Header card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 28,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 13,
              color: "var(--text-faint)",
            }}
          >
            {topic.num}
          </span>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: ps.bg,
              color: ps.color,
              border: `1px solid ${ps.border}`,
            }}
          >
            {topic.priorityLabel}
          </span>
          {topic.pages && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-faint)",
                fontFamily: "var(--font-jetbrains), monospace",
              }}
            >
              pp. {topic.pages}
            </span>
          )}
        </div>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            marginBottom: 12,
          }}
        >
          {topic.title}
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 15, marginBottom: 24, maxWidth: 700 }}>
          {topic.why}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            paddingTop: 20,
            borderTop: "1px solid var(--border)",
          }}
        >
          {[
            { label: "Est. time", value: fmtMinutes(topic.timeMinutes) },
            { label: "Practice Qs", value: topic.practiceQuestions.length.toString() },
            { label: "Sources", value: topic.sources.length.toString() },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-faint)", marginBottom: 4, fontWeight: 600 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Subtopics */}
          {topic.subtopics.length > 0 && (
            <section
              aria-labelledby="subtopics-heading"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "22px 24px",
              }}
            >
              <h2
                id="subtopics-heading"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-dim)",
                  marginBottom: 14,
                }}
              >
                Subtopics
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topic.subtopics.map((st, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: "1.5px solid var(--border-strong)",
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                    <span style={{ flex: 1 }}>{st.text}</span>
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains), monospace",
                        fontSize: 12,
                        color: "var(--text-faint)",
                      }}
                    >
                      {st.time_minutes}m
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Practice questions */}
          {topic.practiceQuestions.length > 0 && (
            <section
              aria-labelledby="pq-heading"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "22px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <h2
                  id="pq-heading"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-dim)",
                  }}
                >
                  Practice questions
                </h2>
                <Link
                  href={`/courses/${courseId}/topics/${topicId}/practice`}
                  style={{
                    padding: "6px 14px",
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    color: "#0a0e1a",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Practice now →
                </Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topic.practiceQuestions.map((pq, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "14px 16px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-jetbrains), monospace",
                        fontSize: 11,
                        color: "var(--text-faint)",
                        marginBottom: 6,
                      }}
                    >
                      Q{i + 1}
                    </div>
                    <p style={{ fontSize: 14 }}>{pq.q}</p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--accent-2)",
                        marginTop: 8,
                        fontFamily: "var(--font-jetbrains), monospace",
                      }}
                    >
                      {pq.source}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Mark studied */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-faint)",
                marginBottom: 12,
                fontWeight: 600,
              }}
            >
              Progress
            </div>
            <button
              onClick={toggleStudied}
              disabled={togglingStudied}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: topic.studied
                  ? "rgba(52,211,153,0.1)"
                  : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                border: topic.studied ? "1px solid rgba(52,211,153,0.4)" : "none",
                color: topic.studied ? "var(--success)" : "#0a0e1a",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                cursor: togglingStudied ? "default" : "pointer",
                transition: "all 0.2s",
                opacity: togglingStudied ? 0.6 : 1,
              }}
              aria-pressed={topic.studied}
            >
              {togglingStudied
                ? "Saving…"
                : topic.studied
                ? "✓ Studied"
                : "Mark as studied"}
            </button>
          </div>

          {/* Source references */}
          {topic.sources.length > 0 && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-faint)",
                  marginBottom: 12,
                  fontWeight: 600,
                }}
              >
                Sources
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topic.sources.map((src, i) => {
                  const file = resolveSourceFile(src.name);
                  const valid = file ? isPageValid(file, src.page) : false;
                  if (file && valid) {
                    return (
                      <Link
                        key={i}
                        href={`/courses/${courseId}/sources/${file.id}?page=${encodeURIComponent(src.page)}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          background: "var(--surface-2)",
                          borderRadius: 6,
                          fontSize: 13,
                          color: "var(--text)",
                          border: "1px solid transparent",
                          transition: "border-color 0.15s",
                          textDecoration: "none",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                        }}
                      >
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {src.name}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-jetbrains), monospace",
                            fontSize: 11,
                            color: "var(--text-faint)",
                            flexShrink: 0,
                          }}
                        >
                          p.{src.page}
                        </span>
                      </Link>
                    );
                  }
                  // Non-clickable ref (file not found or page out of range)
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        background: "var(--surface-2)",
                        borderRadius: 6,
                        fontSize: 13,
                        color: "var(--text-faint)",
                        opacity: 0.7,
                      }}
                      title={!file ? "File not found" : "Page number out of range"}
                    >
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {src.name}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-jetbrains), monospace",
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        p.{src.page}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Back link */}
          <Link
            href={`/courses/${courseId}`}
            style={{
              display: "block",
              textAlign: "center",
              padding: "11px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              transition: "border-color 0.15s",
            }}
          >
            ← Back to study plan
          </Link>
        </div>
      </div>
    </div>
  );
}

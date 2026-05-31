"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddWorkForm } from "./AddWorkForm";
import type { SubmissionKind, SubmissionListItem, SubmissionStatus } from "./types";

const KIND_LABELS: Record<SubmissionKind, string> = {
  ASSIGNMENT: "Assignment",
  PROJECT: "Project",
  PORTFOLIO: "Portfolio",
  ESSAY: "Essay",
  REPORT: "Report",
  CASE_STUDY: "Case study",
  PRESENTATION: "Presentation",
  REFLECTION: "Reflection",
  OTHER: "Other",
};

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  IN_PROGRESS: {
    label: "In progress",
    color: "var(--med)",
    bg: "rgba(251,191,36,0.12)",
    border: "rgba(251,191,36,0.25)",
  },
  READY_FOR_REVIEW: {
    label: "Ready for review",
    color: "var(--low)",
    bg: "rgba(96,165,250,0.12)",
    border: "rgba(96,165,250,0.25)",
  },
  REVIEWED: {
    label: "Reviewed",
    color: "var(--success)",
    bg: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.3)",
  },
};

function score10Color(score: number): string {
  if (score >= 8) return "var(--success)";
  if (score >= 5) return "var(--med)";
  return "var(--high)";
}

function StatusPill({ status }: { status: SubmissionStatus }) {
  const m = STATUS_META[status];
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
        letterSpacing: "0.05em",
        background: m.bg,
        color: m.color,
        border: `1px solid ${m.border}`,
        flexShrink: 0,
      }}
    >
      {m.label}
    </span>
  );
}

export function MyWorkSection({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<SubmissionListItem[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/submissions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data: { submissions: SubmissionListItem[] }) => setItems(data.submissions))
      .catch(() => setItems([]));
  }, [courseId]);

  return (
    <section aria-labelledby="my-work-heading" style={{ marginTop: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h2 id="my-work-heading" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em" }}>
            My work
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
            Your own assignments — reviewed against the rubric, coached toward 10/10
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              padding: "9px 18px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + Add work
          </button>
        )}
      </div>

      {adding && (
        <AddWorkForm
          courseId={courseId}
          onCancel={() => setAdding(false)}
          onCreated={(id) => router.push(`/courses/${courseId}/work/${id}`)}
        />
      )}

      {items === null ? (
        <div className="skeleton" style={{ height: 72, borderRadius: 14 }} aria-busy="true" />
      ) : items.length === 0 && !adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{
            width: "100%",
            background: "var(--surface)",
            border: "1px dashed var(--border-strong)",
            borderRadius: 14,
            padding: "28px 22px",
            textAlign: "center",
            cursor: "pointer",
            color: "var(--text-dim)",
          }}
          className="hover-accent-border"
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
            Upload your first piece of work
          </div>
          <div style={{ fontSize: 13 }}>
            Cogni reviews it against the course rubric and shows exactly what&apos;s missing for full marks.
          </div>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/courses/${courseId}/work/${item.id}`}
              className="hover-card"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "16px 20px",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 16,
                alignItems: "center",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {item.title}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--accent)",
                      background: "var(--accent-soft)",
                      border: "1px solid var(--border)",
                      padding: "2px 7px",
                      borderRadius: 5,
                    }}
                  >
                    {KIND_LABELS[item.kind]}
                  </span>
                  <StatusPill status={item.status} />
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-faint)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.fileName ?? "Pasted text"}
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                {item.latestScore !== null ? (
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        fontFamily: "var(--font-jetbrains), monospace",
                        color: score10Color(item.latestScore),
                      }}
                    >
                      {item.latestScore.toFixed(1)}
                      <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600 }}> / 10</span>
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontWeight: 600,
                      }}
                    >
                      latest
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Not reviewed</span>
                )}
                <span style={{ color: "var(--text-faint)", fontSize: 16 }} aria-hidden="true">
                  ›
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

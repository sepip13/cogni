"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AddWorkForm } from "./AddWorkForm";
import type { DeliverableWithProgress, SubmissionKind } from "./types";

const KIND_LABELS: Record<SubmissionKind, string> = {
  ASSIGNMENT: "Assignment",
  PROJECT: "Project",
  PORTFOLIO: "Portfolio",
  ESSAY: "Essay",
  REPORT: "Report",
  CASE_STUDY: "Case study",
  PRESENTATION: "Presentation",
  REFLECTION: "Reflection",
  OTHER: "Deliverable",
};

const KIND_COLOR: Record<SubmissionKind, string> = {
  ASSIGNMENT: "var(--accent)",
  PROJECT: "var(--accent-2)",
  PORTFOLIO: "var(--med)",
  ESSAY: "var(--low)",
  REPORT: "var(--low)",
  CASE_STUDY: "var(--accent-2)",
  PRESENTATION: "var(--high)",
  REFLECTION: "var(--success)",
  OTHER: "var(--text-dim)",
};

function tint(color: string, pct = 14): string {
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`;
}

function chipStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: tint(color),
    color,
    border: `1px solid ${tint(color, 32)}`,
    flexShrink: 0,
  };
}

function dueMeta(days: number | null): { color: string; label: string } | null {
  if (days == null) return null;
  if (days < 0) return { color: "var(--high)", label: `${Math.abs(days)}d overdue` };
  if (days === 0) return { color: "var(--high)", label: "Due today" };
  if (days <= 7) return { color: "var(--med)", label: `Due in ${days}d` };
  return { color: "var(--text-dim)", label: `Due in ${days}d` };
}

const STATUS_LABEL: Record<DeliverableWithProgress["status"], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  GRADED: "Graded",
};

const STATUS_COLOR: Record<DeliverableWithProgress["status"], string> = {
  NOT_STARTED: "var(--text-faint)",
  IN_PROGRESS: "var(--med)",
  SUBMITTED: "var(--low)",
  GRADED: "var(--success)",
};

function ProgressRing({ pct }: { pct: number }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = pct >= 100 ? "var(--success)" : "var(--accent)";
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx={16} cy={16} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={3} />
      <circle
        cx={16} cy={16} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 16 16)"
        style={{ transition: "stroke-dasharray 0.4s var(--ease-out-expo)" }}
      />
    </svg>
  );
}

function readChecklist(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function useChecklist(deliverableId: string, items: string[]) {
  const storageKey = `cogni:deliverable-checklist:${deliverableId}`;
  // The card only renders client-side (after the deliverables fetch resolves),
  // so a lazy initializer reads localStorage safely with no hydration mismatch.
  const [done, setDone] = useState<Set<string>>(() => readChecklist(storageKey));

  const toggle = useCallback(
    (item: string) => {
      setDone((prev) => {
        const next = new Set(prev);
        if (next.has(item)) next.delete(item);
        else next.add(item);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* ignore quota */
        }
        return next;
      });
    },
    [storageKey]
  );

  const pct = items.length > 0 ? Math.round((items.filter((i) => done.has(i)).length / items.length) * 100) : 0;
  return { done, toggle, pct };
}

export function DeliverableCard({
  courseId,
  deliverable,
  onChanged,
}: {
  courseId: string;
  deliverable: DeliverableWithProgress;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const checklistItems = useMemo(() => {
    const reqs = deliverable.requirements ?? [];
    const crit = (deliverable.rubric ?? []).map((c) => `Meets: ${c.criterion}`);
    return [...reqs, ...crit];
  }, [deliverable.requirements, deliverable.rubric]);

  const { done, toggle, pct } = useChecklist(deliverable.id, checklistItems);
  const due = dueMeta(deliverable.daysUntilDue);
  const kindColor = KIND_COLOR[deliverable.kind];
  const lowConfidence = deliverable.confidence != null && deliverable.confidence < 0.4;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${expanded ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
    >
      {/* Header (click to expand) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="hover-card"
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 16,
          alignItems: "center",
          padding: "16px 20px",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={chipStyle(kindColor)}>{KIND_LABELS[deliverable.kind]}</span>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{deliverable.title}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-dim)" }}>
            {deliverable.weight != null && (
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{deliverable.weight}% of grade</span>
            )}
            {due && <span style={{ color: due.color, fontWeight: 600 }}>{due.label}</span>}
            <span style={{ color: STATUS_COLOR[deliverable.status], fontWeight: 600 }}>
              {STATUS_LABEL[deliverable.status]}
            </span>
            {lowConfidence && <span style={{ color: "var(--med)" }}>· please confirm</span>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          {deliverable.status === "GRADED" && deliverable.bestPercentage != null ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--success)" }}>
                {deliverable.band ? deliverable.band : `${Math.round(deliverable.bestPercentage)}%`}
              </div>
              <div style={{ fontSize: 9, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                {deliverable.band ? `${Math.round(deliverable.bestPercentage)}%` : "best"}
              </div>
            </div>
          ) : checklistItems.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }} title={`${pct}% of checklist done`}>
              <ProgressRing pct={pct} />
            </div>
          ) : null}
          <span style={{ color: "var(--text-faint)", fontSize: 14, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} aria-hidden="true">
            ›
          </span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="fade-in" style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
          {deliverable.description && (
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55, margin: "14px 0" }}>
              {deliverable.description}
            </p>
          )}
          {deliverable.format && (
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>Format: {deliverable.format}</p>
          )}

          {checklistItems.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 8 }}>
                Prep checklist · {pct}%
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {checklistItems.map((item) => {
                  const checked = done.has(item);
                  return (
                    <label
                      key={item}
                      style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", cursor: "pointer", fontSize: 13 }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(item)}
                        style={{ marginTop: 2, accentColor: "var(--accent)", flexShrink: 0 }}
                      />
                      <span style={{ color: checked ? "var(--text-faint)" : "var(--text)", textDecoration: checked ? "line-through" : "none", lineHeight: 1.45 }}>
                        {item}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rubric criteria with real max marks */}
          {(deliverable.rubric ?? []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 8 }}>
                Marking criteria
              </div>
              {deliverable.rubric.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span>{c.criterion}</span>
                  {c.max != null && (
                    <span style={{ fontFamily: "var(--font-jetbrains), monospace", color: "var(--text-dim)", flexShrink: 0 }}>/{c.max}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {preparing ? (
            <div style={{ marginTop: 16 }}>
              <AddWorkForm
                courseId={courseId}
                deliverableId={deliverable.id}
                initialKind={deliverable.kind}
                initialTitle={deliverable.title}
                onCancel={() => setPreparing(false)}
                onCreated={(id) => router.push(`/courses/${courseId}/work/${id}`)}
              />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setPreparing(true)}
                style={{
                  padding: "9px 18px",
                  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                  color: "var(--bg)",
                  border: "none",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {deliverable.submissionCount > 0 ? "Submit another draft" : "Prepare / grade this"}
              </button>
              <Link href={`/courses/${courseId}/guide`} style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>
                Study guide →
              </Link>
              <Link href={`/courses/${courseId}/exams`} style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>
                Quiz me →
              </Link>
              {deliverable.source === "MANUAL" && (
                <DeleteButton courseId={courseId} deliverableId={deliverable.id} onChanged={onChanged} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteButton({ courseId, deliverableId, onChanged }: { courseId: string; deliverableId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/courses/${courseId}/deliverables/${deliverableId}`, { method: "DELETE" });
          onChanged();
        } finally {
          setBusy(false);
        }
      }}
      style={{ marginLeft: "auto", fontSize: 12, color: "var(--high)", fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}
    >
      {busy ? "…" : "Remove"}
    </button>
  );
}

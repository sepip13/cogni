"use client";

import { useState } from "react";

// Shared multiple-choice question card used by the exam trainer and the
// study-guide section quizzes. Grading is instant + client-side (compare the
// pick to the correct option) — no LLM call, so it's free and immediate. The
// correct answer already ships to the client (the old "show model answer"
// button revealed it too), so there's nothing newly exposed.

export interface McqQuestionData {
  q: string;
  options?: string[];
  answer?: string;
  expected_answer?: string;
  key_points?: string[];
}

/** True when a question can be rendered as multiple choice. */
export function isMcq(q: { options?: string[] }): boolean {
  return Array.isArray(q.options) && q.options.length >= 2;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^[a-z][).:\-\s]+/, "") // strip a leading "A)" / "b." style prefix
    .replace(/\s+/g, " ");
}

/**
 * Resolves which option is correct. The model is told to copy the option text
 * into `answer`, but free models sometimes return a letter ("B"), an index, or a
 * near-miss — so we fall back through those forms. Returns -1 if unresolvable.
 */
function correctIndex(options: string[], answer: string): number {
  const a = (answer ?? "").trim();
  if (!a) return -1;

  const exact = options.findIndex((o) => normalize(o) === normalize(a));
  if (exact >= 0) return exact;

  if (/^[a-zA-Z]$/.test(a)) {
    const i = a.toUpperCase().charCodeAt(0) - 65;
    if (i >= 0 && i < options.length) return i;
  }

  const n = parseInt(a, 10);
  if (!Number.isNaN(n)) {
    if (options[n - 1] !== undefined) return n - 1; // 1-based
    if (options[n] !== undefined) return n; // 0-based
  }

  if (normalize(a).length > 2) {
    const sub = options.findIndex((o) => normalize(o).includes(normalize(a)));
    if (sub >= 0) return sub;
  }
  return -1;
}

function FeedbackList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {items.map((m, i) => (
        <div key={i} style={{ fontSize: 13, color: "var(--text-dim)", padding: "3px 0 3px 12px", borderLeft: `2px solid ${color}`, marginBottom: 2, lineHeight: 1.5 }}>{m}</div>
      ))}
    </div>
  );
}

export function McqCard({ question, onNext }: { question: McqQuestionData; onNext?: () => void }) {
  const options = question.options ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = correctIndex(options, question.answer ?? "");
  const isRight = submitted && selected === correct;

  function optionStyle(i: number): React.CSSProperties {
    const base: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: 11,
      width: "100%",
      textAlign: "left",
      padding: "11px 13px",
      borderRadius: 10,
      fontSize: 14,
      lineHeight: 1.45,
      color: "var(--text)",
      background: "var(--surface)",
      border: "1px solid var(--border-strong)",
      cursor: submitted ? "default" : "pointer",
      transition: "border-color var(--duration-fast), background var(--duration-fast)",
    };
    if (!submitted) {
      return selected === i
        ? { ...base, borderColor: "var(--accent)", background: "var(--accent-soft)" }
        : base;
    }
    if (i === correct) {
      return { ...base, borderColor: "var(--success)", background: "rgba(52,211,153,0.12)" };
    }
    if (i === selected) {
      return { ...base, borderColor: "var(--high)", background: "rgba(255,107,107,0.12)" };
    }
    return { ...base, opacity: 0.6 };
  }

  function chipStyle(i: number): React.CSSProperties {
    const c =
      submitted && i === correct
        ? "var(--success)"
        : submitted && i === selected
          ? "var(--high)"
          : selected === i
            ? "var(--accent)"
            : "var(--text-dim)";
    return {
      width: 22,
      height: 22,
      flexShrink: 0,
      borderRadius: 6,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 800,
      fontFamily: "var(--font-jetbrains), monospace",
      color: c,
      border: `1px solid ${c}`,
    };
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {options.map((opt, i) => (
          <button key={i} type="button" disabled={submitted} onClick={() => setSelected(i)} style={optionStyle(i)}>
            <span style={chipStyle(i)} aria-hidden="true">{String.fromCharCode(65 + i)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{opt}</span>
            {submitted && i === correct && <span style={{ color: "var(--success)", fontWeight: 800 }} aria-hidden="true">✓</span>}
            {submitted && i === selected && i !== correct && <span style={{ color: "var(--high)", fontWeight: 800 }} aria-hidden="true">✗</span>}
          </button>
        ))}
      </div>

      {!submitted ? (
        <button
          type="button"
          disabled={selected === null}
          onClick={() => setSubmitted(true)}
          style={{
            padding: "10px 20px",
            background: selected === null ? "var(--surface)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: selected === null ? "var(--text-dim)" : "var(--bg)",
            border: "none",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 700,
            cursor: selected === null ? "default" : "pointer",
          }}
        >
          Check answer
        </button>
      ) : (
        <div className="fade-in">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span
              style={{
                display: "inline-block",
                padding: "3px 11px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                background: isRight ? "rgba(52,211,153,0.14)" : "rgba(255,107,107,0.14)",
                color: isRight ? "var(--success)" : "var(--high)",
              }}
            >
              {isRight ? "Correct ✓" : "Not quite"}
            </span>
            {!isRight && correct >= 0 && (
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Answer: <strong style={{ color: "var(--text)" }}>{String.fromCharCode(65 + correct)}</strong>
              </span>
            )}
          </div>
          {question.expected_answer && (
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>{question.expected_answer}</p>
          )}
          <FeedbackList title="Key points" items={question.key_points ?? []} color="var(--accent)" />
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              style={{ marginTop: 14, padding: "10px 20px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Next question →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

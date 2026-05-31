"use client";

import { useState } from "react";
import type { ExamGrade, SectionQuizQuestion } from "../types";

// Mirrors the mock-exam practice UX (answer → grade → feedback), but scoped to
// the 1–3 questions cached on ONE study-guide section and graded through the
// section quiz grade route.
const VERDICT_STYLES: Record<ExamGrade["verdict"], { bg: string; color: string; label: string }> = {
  correct: { bg: "rgba(52,211,153,0.12)", color: "var(--success)", label: "Strong answer" },
  partially_correct: { bg: "rgba(251,191,36,0.12)", color: "var(--med)", label: "Partially there" },
  incorrect: { bg: "rgba(255,107,107,0.12)", color: "var(--high)", label: "Needs work" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--med)";
  return "var(--high)";
}

function FeedbackList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {items.map((m, i) => (
        <div key={i} style={{ fontSize: 13, color: "var(--text-dim)", padding: "4px 0 4px 14px", borderLeft: `2px solid ${color}`, marginBottom: 3, lineHeight: 1.5 }}>{m}</div>
      ))}
    </div>
  );
}

export function SectionQuiz({
  courseId,
  sectionId,
  questions,
  examStyle,
}: {
  courseId: string;
  sectionId: string;
  questions: SectionQuizQuestion[];
  examStyle: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<ExamGrade | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState("");

  const q = questions[current];
  const vs = result ? VERDICT_STYLES[result.verdict] : null;
  const multi = questions.length > 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || grading) return;
    setGrading(true);
    setError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/guide/sections/${sectionId}/quiz/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex: current, answer: answer.trim() }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? "Grading failed.");
        return;
      }
      setResult((await res.json()) as ExamGrade);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setGrading(false);
    }
  }

  function next() {
    setResult(null);
    setAnswer("");
    setShowAnswer(false);
    setError("");
    setCurrent((c) => Math.min(c + 1, questions.length - 1));
  }

  if (!q) return null;

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>
          {examStyle ? "Exam-style question" : "Practice question"}
        </span>
        {multi && (
          <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-jetbrains), monospace" }}>
            {current + 1} / {questions.length}
          </span>
        )}
      </div>

      <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 4 }}>{q.q}</p>
      {(q.type || q.marks != null) && (
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 14 }}>
          {q.type ? q.type : ""}{q.type && q.marks != null ? " · " : ""}{q.marks != null ? `${q.marks} marks` : ""}
        </p>
      )}

      {!result ? (
        <form onSubmit={submit}>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write your answer…"
            rows={4}
            disabled={grading}
            style={{ width: "100%", padding: "11px 13px", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 9, fontSize: 14, color: "var(--text)", fontFamily: "inherit", resize: "vertical", outline: "none", marginBottom: 10 }}
          />
          {error && <p style={{ fontSize: 13, color: "var(--high)", marginBottom: 10 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" disabled={grading || !answer.trim()} style={{ padding: "10px 20px", background: grading || !answer.trim() ? "var(--surface)" : "linear-gradient(135deg, var(--accent), var(--accent-2))", color: grading || !answer.trim() ? "var(--text-dim)" : "var(--bg)", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: grading || !answer.trim() ? "default" : "pointer" }} aria-busy={grading}>
              {grading ? "Grading…" : "Check my answer"}
            </button>
            {q.expected_answer && (
              <button type="button" onClick={() => setShowAnswer((v) => !v)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer" }}>
                {showAnswer ? "Hide model answer" : "Show model answer"}
              </button>
            )}
          </div>
          {showAnswer && q.expected_answer && (
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, padding: "10px 12px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>{q.expected_answer}</p>
          )}
        </form>
      ) : (
        vs && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", border: `3px solid ${scoreColor(result.score)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: scoreColor(result.score) }}>{result.score}</span>
                <span style={{ fontSize: 9, color: "var(--text-faint)" }}>/ 100</span>
              </div>
              <div>
                <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: vs.bg, color: vs.color, marginBottom: 6 }}>{vs.label}</span>
                <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>{result.feedback}</p>
              </div>
            </div>
            <FeedbackList title="What you got right" items={result.strengths} color="var(--success)" />
            <FeedbackList title="What to add" items={result.missing_points} color="var(--high)" />
            {current + 1 < questions.length && (
              <button onClick={next} style={{ marginTop: 8, padding: "10px 20px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Next question →</button>
            )}
          </div>
        )
      )}
    </div>
  );
}

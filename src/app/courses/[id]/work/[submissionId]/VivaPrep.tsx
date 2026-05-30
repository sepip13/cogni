"use client";

import { useEffect, useState } from "react";
import type { ExaminerQuestion, VivaGrade } from "../../types";

const DIFFICULTY_META: Record<ExaminerQuestion["difficulty"], { label: string; color: string; bg: string }> = {
  easy: { label: "Easy", color: "var(--success)", bg: "rgba(52,211,153,0.12)" },
  medium: { label: "Medium", color: "var(--med)", bg: "rgba(251,191,36,0.12)" },
  hard: { label: "Hard", color: "var(--high)", bg: "rgba(255,107,107,0.12)" },
};

const VERDICT_STYLES: Record<VivaGrade["verdict"], { bg: string; color: string; label: string }> = {
  correct: { bg: "rgba(52,211,153,0.12)", color: "var(--success)", label: "Strong answer" },
  partially_correct: { bg: "rgba(251,191,36,0.12)", color: "var(--med)", label: "Partially there" },
  incorrect: { bg: "rgba(255,107,107,0.12)", color: "var(--high)", label: "Needs work" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--med)";
  return "var(--high)";
}

export function VivaPrep({
  courseId,
  submissionId,
  initialHasQuestions,
  canGenerate,
}: {
  courseId: string;
  submissionId: string;
  initialHasQuestions: boolean;
  canGenerate: boolean;
}) {
  const [questions, setQuestions] = useState<ExaminerQuestion[]>([]);
  const [loading, setLoading] = useState(initialHasQuestions);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [showKeyPoints, setShowKeyPoints] = useState(false);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<VivaGrade | null>(null);

  useEffect(() => {
    if (!initialHasQuestions) return;
    fetch(`/api/courses/${courseId}/submissions/${submissionId}/questions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { questions?: ExaminerQuestion[] } | null) => {
        if (d?.questions) setQuestions(d.questions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, submissionId, initialHasQuestions]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/submissions/${submissionId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not generate questions.");
        return;
      }
      const data = (await res.json()) as { questions: ExaminerQuestion[] };
      setQuestions(data.questions);
      setCurrent(0);
      setAnswer("");
      setResult(null);
      setShowKeyPoints(false);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || grading) return;
    setGrading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/courses/${courseId}/submissions/${submissionId}/questions/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIndex: current, answer: answer.trim() }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Grading failed.");
        return;
      }
      setResult((await res.json()) as VivaGrade);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setGrading(false);
    }
  }

  function next() {
    setResult(null);
    setAnswer("");
    setShowKeyPoints(false);
    setCurrent((c) => Math.min(c + 1, questions.length - 1));
  }

  const heading = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>Viva prep</h3>
      {questions.length > 0 && (
        <button
          onClick={generate}
          disabled={generating}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: generating ? "default" : "pointer",
          }}
        >
          {generating ? "Regenerating…" : "Regenerate"}
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div style={panelStyle}>
        {heading}
        <div className="skeleton" style={{ height: 120, borderRadius: 12, marginTop: 14 }} />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={panelStyle}>
        {heading}
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "6px 0 16px" }}>
          Generate the questions an examiner is most likely to ask about <em>this</em> work, then
          practice your answers.
        </p>
        {error && <p style={{ fontSize: 13, color: "var(--high)", marginBottom: 12 }}>{error}</p>}
        <button
          onClick={generate}
          disabled={generating || !canGenerate}
          style={{
            padding: "11px 20px",
            background: generating || !canGenerate ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: generating || !canGenerate ? "var(--text-dim)" : "var(--bg)",
            border: "none",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 700,
            cursor: generating || !canGenerate ? "default" : "pointer",
          }}
          aria-busy={generating}
        >
          {generating ? "Generating questions…" : "Generate examiner questions"}
        </button>
        {!canGenerate && (
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10 }}>
            Add readable content to this work first.
          </p>
        )}
      </div>
    );
  }

  const q = questions[current];
  const diff = DIFFICULTY_META[q.difficulty];
  const vs = result ? VERDICT_STYLES[result.verdict] : null;

  return (
    <div style={panelStyle}>
      {heading}
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "14px 0 18px" }}>
        <div style={{ flex: 1, height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${((current + 1) / questions.length) * 100}%`,
              background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-jetbrains), monospace", flexShrink: 0 }}>
          {current + 1} / {questions.length}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: diff.color,
            background: diff.bg,
            padding: "2px 8px",
            borderRadius: 5,
          }}
        >
          {diff.label}
        </span>
      </div>
      <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>{q.q}</p>
      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16, fontStyle: "italic" }}>
        Why an examiner asks this: {q.why_asked}
      </p>

      {!result ? (
        <form onSubmit={submitAnswer}>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer as if you were defending your work out loud…"
            rows={5}
            disabled={grading}
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: 14,
              color: "var(--text)",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              marginBottom: 12,
            }}
          />
          {error && <p style={{ fontSize: 13, color: "var(--high)", marginBottom: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="submit"
              disabled={grading || !answer.trim()}
              style={{
                padding: "11px 22px",
                background: grading || !answer.trim() ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: grading || !answer.trim() ? "var(--text-dim)" : "var(--bg)",
                border: "none",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 700,
                cursor: grading || !answer.trim() ? "default" : "pointer",
              }}
              aria-busy={grading}
            >
              {grading ? "Grading…" : "Submit answer"}
            </button>
            <button
              type="button"
              onClick={() => setShowKeyPoints((v) => !v)}
              style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer" }}
            >
              {showKeyPoints ? "Hide key points" : "Reveal key points"}
            </button>
          </div>
          {showKeyPoints && (
            <ul style={{ marginTop: 14, paddingLeft: 18, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
              {q.key_points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </form>
      ) : (
        vs && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  border: `3px solid ${scoreColor(result.score)}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 800, color: scoreColor(result.score) }}>{result.score}</span>
                <span style={{ fontSize: 9, color: "var(--text-faint)" }}>/ 100</span>
              </div>
              <div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 11px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    background: vs.bg,
                    color: vs.color,
                    marginBottom: 6,
                  }}
                >
                  {vs.label}
                </span>
                <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>{result.feedback}</p>
              </div>
            </div>

            {result.strengths.length > 0 && (
              <FeedbackList title="What you got right" items={result.strengths} color="var(--success)" />
            )}
            {result.missing_points.length > 0 && (
              <FeedbackList title="What to add" items={result.missing_points} color="var(--high)" />
            )}

            {current + 1 < questions.length && (
              <button
                onClick={next}
                style={{
                  marginTop: 16,
                  padding: "11px 22px",
                  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                  color: "var(--bg)",
                  border: "none",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Next question →
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 24,
};

function FeedbackList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </div>
      {items.map((m, i) => (
        <div key={i} style={{ fontSize: 13, color: "var(--text-dim)", padding: "4px 0 4px 14px", borderLeft: `2px solid ${color}`, marginBottom: 3, lineHeight: 1.5 }}>
          {m}
        </div>
      ))}
    </div>
  );
}

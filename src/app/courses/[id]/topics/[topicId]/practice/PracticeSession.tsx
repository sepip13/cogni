"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PracticeQuestion {
  q: string;
  source: string;
  expected_answer: string;
}

interface GradeResult {
  score: number;
  verdict: "correct" | "partially_correct" | "incorrect";
  feedback: string;
  missing_points: string[];
  strengths: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VERDICT_STYLES: Record<GradeResult["verdict"], { bg: string; color: string; label: string }> = {
  correct:           { bg: "rgba(52,211,153,0.12)", color: "var(--success)", label: "Correct" },
  partially_correct: { bg: "rgba(251,191,36,0.12)", color: "var(--med)",     label: "Partially correct" },
  incorrect:         { bg: "rgba(255,107,107,0.12)", color: "var(--high)",   label: "Incorrect" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--med)";
  return "var(--high)";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PracticeSession({
  courseId,
  topicId,
}: {
  courseId: string;
  topicId: string;
}) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [topicTitle, setTopicTitle] = useState("");
  const [courseName, setCourseName] = useState("");
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/topics/${topicId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setLoadError(true); return; }
        setQuestions(data.topic.practiceQuestions ?? []);
        setTopicTitle(data.topic.title);
        setCourseName(data.courseName);
      })
      .catch(() => setLoadError(true));
  }, [courseId, topicId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setGrading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/courses/${courseId}/topics/${topicId}/practice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIndex: current, answer: answer.trim() }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Grading failed. Please try again.");
        return;
      }
      setResult(await res.json());
    } catch {
      setError("Network error — please try again.");
    } finally {
      setGrading(false);
    }
  }

  function nextQuestion() {
    setResult(null);
    setAnswer("");
    setError("");
    setCurrent((c) => (c + 1) % questions.length);
  }

  if (loadError) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
        Could not load practice questions.{" "}
        <Link href={`/courses/${courseId}/topics/${topicId}`} style={{ color: "var(--accent)" }}>
          Back to topic
        </Link>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={{ paddingTop: 40 }} aria-busy="true">
        <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      </div>
    );
  }

  const q = questions[current];
  const vs = result ? VERDICT_STYLES[result.verdict] : null;

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)", marginBottom: 24 }}
      >
        <Link href="/dashboard" style={{ color: "var(--text-dim)" }}>My courses</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <Link href={`/courses/${courseId}`} style={{ color: "var(--text-dim)" }}>{courseName}</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <Link href={`/courses/${courseId}/topics/${topicId}`} style={{ color: "var(--text-dim)" }}>{topicTitle}</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <span style={{ color: "var(--text)" }} aria-current="page">Practice</span>
      </nav>

      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <div
          style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemax={questions.length}
          aria-label="Question progress"
        >
          <div
            style={{
              height: "100%",
              width: `${((current + 1) / questions.length) * 100}%`,
              background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
              transition: "width 0.4s",
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 13,
            color: "var(--text-dim)",
            flexShrink: 0,
          }}
        >
          {current + 1} / {questions.length}
        </span>
      </div>

      {/* Question card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 32,
          marginBottom: result ? 16 : 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--accent)",
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Question {current + 1}
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>
          {q.q}
        </p>
        <p
          style={{
            fontSize: 12,
            color: "var(--accent-2)",
            fontFamily: "var(--font-jetbrains), monospace",
            marginBottom: 28,
          }}
        >
          {q.source}
        </p>

        {!result ? (
          <form onSubmit={handleSubmit}>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write your answer here…"
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
                marginBottom: 16,
              }}
            />
            {error && (
              <div
                role="alert"
                style={{
                  background: "rgba(255,107,107,0.1)",
                  border: "1px solid rgba(255,107,107,0.3)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--high)",
                  marginBottom: 14,
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={grading || !answer.trim()}
              style={{
                width: "100%",
                padding: "14px",
                background:
                  grading || !answer.trim()
                    ? "var(--surface-2)"
                    : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: grading || !answer.trim() ? "var(--text-dim)" : "#0a0e1a",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                cursor: grading || !answer.trim() ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              aria-busy={grading}
            >
              {grading ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid var(--border-strong)",
                      borderTopColor: "var(--accent)",
                      animation: "spin 0.7s linear infinite",
                      display: "inline-block",
                    }}
                    aria-hidden="true"
                  />
                  Grading…
                </>
              ) : (
                "Submit answer →"
              )}
            </button>
          </form>
        ) : null}
      </div>

      {/* Result card */}
      {result && vs && (
        <div
          className="fade-in"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 28,
          }}
        >
          {/* Score row */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                border: `3px solid ${scoreColor(result.score)}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-label={`Score: ${result.score} out of 100`}
            >
              <span style={{ fontSize: 22, fontWeight: 800, color: scoreColor(result.score) }}>
                {result.score}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>/ 100</span>
            </div>
            <div>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  background: vs.bg,
                  color: vs.color,
                  marginBottom: 6,
                }}
              >
                {vs.label}
              </span>
              <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5 }}>
                {result.feedback}
              </p>
            </div>
          </div>

          {/* Strengths */}
          {result.strengths.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                What you got right
              </div>
              {result.strengths.map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: "var(--text-dim)", padding: "4px 0 4px 14px", borderLeft: "2px solid var(--success)" }}>
                  {s}
                </div>
              ))}
            </div>
          )}

          {/* Missing points */}
          {result.missing_points.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--high)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                What to improve
              </div>
              {result.missing_points.map((m, i) => (
                <div key={i} style={{ fontSize: 13, color: "var(--text-dim)", padding: "4px 0 4px 14px", borderLeft: "2px solid var(--high)" }}>
                  {m}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            {questions.length > 1 && (
              <button
                onClick={nextQuestion}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                  color: "#0a0e1a",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Next question →
              </button>
            )}
            <Link
              href={`/courses/${courseId}/topics/${topicId}`}
              style={{
                flex: 1,
                padding: "12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                color: "var(--text)",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 14,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Back to topic
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

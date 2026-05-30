"use client";

import { useState } from "react";
import { ExplainChat } from "./ExplainChat";
import { MockExamPractice } from "./MockExamPractice";
import type { ExamTrialData, MockStatus, TrialStatus } from "../types";

const TRIAL_STATUS: Record<TrialStatus, { label: string; color: string; bg: string }> = {
  PARSING: { label: "Reading…", color: "var(--med)", bg: "rgba(251,191,36,0.12)" },
  READY: { label: "Ready", color: "var(--success)", bg: "rgba(52,211,153,0.12)" },
  FAILED: { label: "Failed", color: "var(--high)", bg: "rgba(255,107,107,0.12)" },
};

function StatusPill({ status }: { status: TrialStatus | MockStatus }) {
  const meta =
    status in TRIAL_STATUS
      ? TRIAL_STATUS[status as TrialStatus]
      : { label: status, color: "var(--text-dim)", bg: "var(--surface-2)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: meta.color, background: meta.bg, border: `1px solid ${meta.color}`, padding: "2px 8px", borderRadius: 5 }}>
      {meta.label}
    </span>
  );
}

export function TrialCard({
  courseId,
  trial,
  onGenerateMock,
  onDelete,
  onRetry,
}: {
  courseId: string;
  trial: ExamTrialData;
  onGenerateMock: (trialId: string, count: number) => void;
  onDelete: (trialId: string) => void;
  onRetry: (trialId: string) => void;
}) {
  const questions = trial.questions ?? [];
  const [openExplain, setOpenExplain] = useState<number | null>(null);
  const [openMock, setOpenMock] = useState<string | null>(null);
  const [count, setCount] = useState(Math.min(30, Math.max(1, questions.length || 8)));

  return (
    <article style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em", flex: 1, minWidth: 0 }}>{trial.title}</h2>
        <StatusPill status={trial.status} />
        <button onClick={() => onDelete(trial.id)} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer" }} aria-label="Delete trial">
          Remove
        </button>
      </div>

      {trial.status === "PARSING" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-dim)" }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border-strong)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite", display: "inline-block" }} aria-hidden="true" />
          Reading your exam and splitting it into questions…
        </div>
      )}

      {trial.status === "FAILED" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13, color: "var(--high)", flex: 1, minWidth: 0 }}>
            {trial.error || "Couldn't read this exam. Try a clearer file or paste the text."}
          </p>
          <button
            onClick={() => onRetry(trial.id)}
            style={{ padding: "8px 16px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          >
            Try again
          </button>
        </div>
      )}

      {trial.status === "READY" && (
        <>
          {/* Create a similar practice exam */}
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Make a similar practice exam</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "var(--text-dim)" }}>
                Questions:{" "}
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={count}
                  onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                  style={{ width: 60, padding: "6px 8px", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 7, fontSize: 13, color: "var(--text)", marginLeft: 4 }}
                />
              </label>
              <button onClick={() => onGenerateMock(trial.id, count)} style={{ padding: "9px 18px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Create practice exam
              </button>
            </div>

            {trial.mockExams.map((mock) => (
              <div key={mock.id} style={{ marginTop: 12 }}>
                {mock.status === "GENERATING" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--text-dim)" }}>
                    <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--border-strong)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite", display: "inline-block" }} aria-hidden="true" />
                    Building your practice exam…
                  </div>
                ) : mock.status === "FAILED" ? (
                  <p style={{ fontSize: 13, color: "var(--high)" }}>{mock.error || "Couldn't build the exam."}</p>
                ) : mock.questions && mock.questions.length > 0 ? (
                  <div>
                    <button onClick={() => setOpenMock(openMock === mock.id ? null : mock.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                      <span>{mock.title} · {mock.questions.length} questions</span>
                      <span style={{ color: "var(--accent)" }}>{openMock === mock.id ? "Hide" : "Practice →"}</span>
                    </button>
                    {openMock === mock.id && <MockExamPractice courseId={courseId} mockId={mock.id} questions={mock.questions} />}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Trial questions with Explain */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 10 }}>
            {questions.length} questions · tap Explain for a worked walkthrough
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-jetbrains), monospace", color: "var(--text-faint)", flexShrink: 0, marginTop: 2 }}>{q.num ?? i + 1}</span>
                  <p style={{ fontSize: 14, lineHeight: 1.55, flex: 1, minWidth: 0 }}>{q.text}</p>
                  <button onClick={() => setOpenExplain(openExplain === i ? null : i)} style={{ padding: "6px 12px", background: openExplain === i ? "var(--accent-soft)" : "var(--surface)", border: `1px solid ${openExplain === i ? "var(--accent)" : "var(--border-strong)"}`, borderRadius: 7, fontSize: 12, fontWeight: 700, color: openExplain === i ? "var(--accent)" : "var(--text-dim)", cursor: "pointer", flexShrink: 0 }}>
                    {openExplain === i ? "Close" : "Explain"}
                  </button>
                </div>
                {openExplain === i && <ExplainChat courseId={courseId} trialId={trial.id} qIndex={i} />}
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExamUploadForm } from "./ExamUploadForm";
import { TrialCard } from "./TrialCard";
import type { ExamTrialData } from "../types";

const POLL_MS = 2500;

export function ExamTrainerView({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [trials, setTrials] = useState<ExamTrialData[] | null>(null);
  const [adding, setAdding] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTrials = useCallback(() => {
    return fetch(`/api/courses/${courseId}/exams/trials`)
      .then((r) => (r.ok ? (r.json() as Promise<{ trials: ExamTrialData[] }>) : Promise.reject()))
      .then((d) => setTrials(d.trials))
      .catch(() => setTrials((t) => t ?? []));
  }, [courseId]);

  useEffect(() => {
    fetchTrials();
  }, [fetchTrials]);

  const busy =
    trials?.some((t) => t.status === "PARSING" || t.mockExams.some((m) => m.status === "GENERATING")) ?? false;
  useEffect(() => {
    if (!busy) return;
    pollRef.current = setInterval(fetchTrials, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [busy, fetchTrials]);

  function generateMock(trialId: string, count: number) {
    setTrials((prev) =>
      prev
        ? prev.map((t) =>
            t.id === trialId
              ? { ...t, mockExams: [{ id: `tmp-${trialId}`, title: "Practice exam", status: "GENERATING" as const, questions: null, error: null, createdAt: "" }, ...t.mockExams] }
              : t
          )
        : prev
    );
    fetch(`/api/courses/${courseId}/exams/trials/${trialId}/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    })
      .then(() => fetchTrials())
      .catch(() => {});
  }

  function deleteTrial(trialId: string) {
    setTrials((prev) => (prev ? prev.filter((t) => t.id !== trialId) : prev));
    fetch(`/api/courses/${courseId}/exams/trials/${trialId}`, { method: "DELETE" }).catch(() => fetchTrials());
  }

  return (
    <div className="fade-in">
      <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)", marginBottom: 22, flexWrap: "wrap" }}>
        <Link href="/dashboard" style={{ color: "var(--text-dim)" }}>My courses</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <Link href={`/courses/${courseId}`} style={{ color: "var(--text-dim)" }}>{courseName}</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <span style={{ color: "var(--text)" }} aria-current="page">Exam trainer</span>
      </nav>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 6 }}>Exam trainer</h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)" }}>Upload a past paper → get a similar practice exam, and a worked walkthrough for every question.</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Add a trial exam
          </button>
        )}
      </div>

      {adding && (
        <ExamUploadForm
          courseId={courseId}
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            fetchTrials();
          }}
        />
      )}

      {trials === null ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 16 }} aria-busy="true" />
      ) : trials.length === 0 && !adding ? (
        <button
          onClick={() => setAdding(true)}
          className="hover-accent-border"
          style={{ width: "100%", background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: 16, padding: "30px 22px", textAlign: "center", cursor: "pointer", color: "var(--text-dim)" }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }} aria-hidden="true">📝</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Upload a trial exam</div>
          <div style={{ fontSize: 13 }}>Cogni splits it into questions, builds a similar practice exam, and explains each one.</div>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {trials.map((t) => (
            <TrialCard key={t.id} courseId={courseId} trial={t} onGenerateMock={generateMock} onDelete={deleteTrial} />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeliverableCard } from "./DeliverableCard";
import { projectGrade } from "@/lib/grade-projection";
import type { DeliverablesResponse, DeliverableWithProgress, GradingScheme } from "./types";

const POLL_MS = 2500;
const MAX_POLLS = 120; // ~5 min ceiling

/** Urgency order: overdue → soonest due → no-date (weighted before unweighted). */
function byUrgency(a: DeliverableWithProgress, b: DeliverableWithProgress): number {
  const ad = a.daysUntilDue ?? Number.POSITIVE_INFINITY;
  const bd = b.daysUntilDue ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return (b.weight ?? -1) - (a.weight ?? -1);
}

function schemeFrom(deliverables: DeliverableWithProgress[]): GradingScheme | null {
  return deliverables.find((d) => d.gradingScheme?.bands?.length)?.gradingScheme ?? null;
}

function ProjectionStrip({ deliverables }: { deliverables: DeliverableWithProgress[] }) {
  const scheme = schemeFrom(deliverables);
  const weighted = deliverables.filter((d) => d.weight != null);
  if (weighted.length === 0) return null;

  const proj = projectGrade(
    weighted.map((d) => ({ weight: d.weight, bestPercentage: d.bestPercentage })),
    scheme
  );
  const totalWeight = weighted.reduce((s, d) => s + (d.weight ?? 0), 0);
  const anyGraded = proj.weightAccountedFor > 0;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
          Grade projection
        </div>
        {anyGraded && (
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Graded so far:{" "}
            <span style={{ fontWeight: 800, color: "var(--text)" }}>{proj.weightedSoFar}%</span>
            {proj.currentBand && <span style={{ color: "var(--success)", fontWeight: 700 }}> · {proj.currentBand}</span>}
          </div>
        )}
      </div>

      {/* Weighted bar of all deliverables */}
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--surface-2)", gap: 1 }}>
        {weighted.map((d) => {
          const widthPct = totalWeight > 0 ? ((d.weight ?? 0) / totalWeight) * 100 : 0;
          const graded = d.bestPercentage != null;
          return (
            <div
              key={d.id}
              title={`${d.title} — ${d.weight}%${graded ? ` · ${Math.round(d.bestPercentage!)}%` : ""}`}
              style={{
                width: `${widthPct}%`,
                background: graded
                  ? "linear-gradient(90deg, var(--accent), var(--accent-2))"
                  : "color-mix(in oklab, var(--accent) 22%, transparent)",
              }}
            />
          );
        })}
      </div>

      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.5 }}>
        {!anyGraded ? (
          <>Grade a deliverable to see where you stand and what it takes to hit the next band.</>
        ) : proj.toNextBand ? (
          <>
            On track for <strong style={{ color: "var(--text)" }}>{proj.currentBand || "your current band"}</strong>. To reach{" "}
            <strong style={{ color: "var(--accent)" }}>{proj.toNextBand.band}</strong>, average{" "}
            <strong style={{ color: "var(--accent)" }}>≥{proj.toNextBand.requiredAvgOnRemaining}%</strong> on the remaining deliverables.
          </>
        ) : (
          <>On track for <strong style={{ color: "var(--success)" }}>{proj.currentBand || "your target"}</strong> — keep it up.</>
        )}
        {totalWeight < 99 && (
          <span style={{ color: "var(--text-faint)" }}> (Only {Math.round(totalWeight)}% of the grade has a stated weight.)</span>
        )}
      </div>
    </div>
  );
}

function ExtractCTA({ onExtract, busy, error }: { onExtract: () => void; busy: boolean; error: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px dashed var(--border-strong)",
        borderRadius: 14,
        padding: "30px 24px",
        textAlign: "center",
        color: "var(--text-dim)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
        Find everything you need to prepare
      </div>
      <div style={{ fontSize: 13, marginBottom: 18, maxWidth: 460, margin: "0 auto 18px" }}>
        Cogni reads your module guide and brief to list every assessed deliverable — with its weight,
        due date, format, and marking rubric — so nothing slips through.
      </div>
      {error && (
        <div role="alert" style={{ fontSize: 13, color: "var(--high)", marginBottom: 14 }}>{error}</div>
      )}
      <button
        type="button"
        onClick={onExtract}
        disabled={busy}
        style={{
          padding: "11px 24px",
          background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: busy ? "var(--text-dim)" : "var(--bg)",
          border: "none",
          borderRadius: 9,
          fontSize: 14,
          fontWeight: 700,
          cursor: busy ? "default" : "pointer",
        }}
        aria-busy={busy}
      >
        {busy ? "Reading your brief…" : "Find what I need to prepare"}
      </button>
    </div>
  );
}

function GeneratingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-dim)" }}>
        <span
          style={{
            width: 14, height: 14, borderRadius: "50%",
            border: "2px solid var(--border-strong)", borderTopColor: "var(--accent)",
            animation: "spin 0.7s linear infinite", display: "inline-block", flexShrink: 0,
          }}
          aria-hidden="true"
        />
        Reading your brief and rubric…
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} aria-busy="true" />
      ))}
    </div>
  );
}

export function AssignmentBuddy({ courseId }: { courseId: string }) {
  const [data, setData] = useState<DeliverablesResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const pollCount = useRef(0);

  const fetchList = useCallback(() => {
    return fetch(`/api/courses/${courseId}/deliverables`)
      .then((r) => (r.ok ? (r.json() as Promise<DeliverablesResponse>) : Promise.reject(new Error("load failed"))))
      .then((json) => setData(json))
      .catch(() => setLoadError(true));
  }, [courseId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Poll while extraction runs in the background.
  const generating = data?.status === "GENERATING";
  useEffect(() => {
    if (!generating) return;
    pollCount.current = 0;
    const t = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) clearInterval(t);
      fetchList();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [generating, fetchList]);

  async function runExtract() {
    setExtracting(true);
    setExtractError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/deliverables/extract`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setExtractError(body.error ?? "Could not start. Please try again.");
        return;
      }
      setData((prev) => (prev ? { ...prev, status: "GENERATING" } : prev));
      await fetchList();
    } catch {
      setExtractError("Network error — please try again.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <section aria-labelledby="assignment-buddy-heading" style={{ marginTop: 40 }}>
      <div
        style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16,
          marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h2 id="assignment-buddy-heading" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em" }}>
            Assignment buddy
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
            Every deliverable, its rubric, and what it takes to hit the next band
          </p>
        </div>
        {data && data.status === "READY" && data.deliverables.length > 0 && (
          <button
            type="button"
            onClick={runExtract}
            disabled={extracting}
            style={{
              padding: "8px 14px", background: "var(--surface-2)", border: "1px solid var(--border-strong)",
              borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "var(--text)",
              cursor: extracting ? "default" : "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {extracting ? "…" : "Re-scan"}
          </button>
        )}
      </div>

      {loadError ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "20px 0" }}>
          Could not load your deliverables.
        </div>
      ) : data === null ? (
        <div className="skeleton" style={{ height: 72, borderRadius: 14 }} aria-busy="true" />
      ) : data.status === "GENERATING" ? (
        <GeneratingState />
      ) : data.deliverables.length === 0 ? (
        <ExtractCTA
          onExtract={runExtract}
          busy={extracting}
          error={data.status === "FAILED" ? extractError || "Extraction failed — try again." : extractError}
        />
      ) : (
        <>
          <ProjectionStrip deliverables={data.deliverables} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...data.deliverables].sort(byUrgency).map((d) => (
              <DeliverableCard key={d.id} courseId={courseId} deliverable={d} onChanged={fetchList} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

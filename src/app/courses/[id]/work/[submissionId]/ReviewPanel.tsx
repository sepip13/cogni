"use client";

import type { SubmissionReview } from "../../types";

function score10Color(score: number): string {
  if (score >= 8) return "var(--success)";
  if (score >= 5) return "var(--med)";
  return "var(--high)";
}

function ScoreRing({ score }: { score: number }) {
  const color = score10Color(score);
  return (
    <div
      style={{
        width: 84,
        height: 84,
        borderRadius: "50%",
        border: `3px solid ${color}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      aria-label={`Score: ${score} out of 10`}
    >
      <span style={{ fontSize: 26, fontWeight: 800, color }}>{score.toFixed(1)}</span>
      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>/ 10</span>
    </div>
  );
}

function CriterionRow({
  criterion,
  scored,
  max,
  comment,
  band,
}: {
  criterion: string;
  scored: number;
  max: number;
  comment: string;
  band?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (scored / max) * 100)) : 0;
  const color = pct >= 80 ? "var(--success)" : pct >= 50 ? "var(--med)" : "var(--high)";
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {criterion}
          {band && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", marginLeft: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {band}
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: 13,
            fontFamily: "var(--font-jetbrains), monospace",
            color,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {scored}/{max}
        </span>
      </div>
      <div
        style={{ height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      {comment && <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>{comment}</p>}
    </div>
  );
}

function BulletList({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color,
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{ fontSize: 13, color: "var(--text-dim)", padding: "5px 0 5px 14px", borderLeft: `2px solid ${color}`, marginBottom: 4, lineHeight: 1.5 }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

export function ReviewPanel({ review }: { review: SubmissionReview }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
        <ScoreRing score={review.scoreOutOf10} />
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--accent)",
                fontWeight: 700,
              }}
            >
              Rubric review
            </span>
            {review.band && (
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--success)" }}>
                {review.band}
                {review.percentage != null && (
                  <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600 }}>
                    {" "}· {Math.round(review.percentage)}%
                  </span>
                )}
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>{review.summary}</p>
        </div>
      </div>

      {review.gapToNextBand && (
        <div
          style={{
            background: "color-mix(in oklab, var(--med) 12%, transparent)",
            border: "1px solid color-mix(in oklab, var(--med) 30%, transparent)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--med)", marginBottom: 4 }}>
            → {review.nextBand ? `To reach ${review.nextBand}` : "To move up a band"}
          </div>
          <p style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.55 }}>{review.gapToNextBand}</p>
        </div>
      )}

      {review.rubricBreakdown.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text-faint)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Per-criterion breakdown
          </div>
          {review.rubricBreakdown.map((c, i) => (
            <CriterionRow key={i} {...c} />
          ))}
        </div>
      )}

      <BulletList title="Strengths" items={review.strengths} color="var(--success)" />
      <BulletList title="What's missing for 10/10" items={review.gaps} color="var(--high)" />
    </div>
  );
}

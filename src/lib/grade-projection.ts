/**
 * Grade projection — pure, deterministic, no LLM.
 *
 * Given each deliverable's weight (% of final grade) and the best percentage the
 * student has scored on it so far, project the current weighted grade and the
 * average mark needed on the remaining (ungraded) weight to reach the next band.
 *
 * This is the most motivating surface of Assignment Buddy and it must never cost
 * an LLM call — it is plain arithmetic over the extracted grading scheme.
 *
 * Every function here is pure (no I/O, no mutation of inputs).
 */

export interface GradingBand {
  /** Band name, e.g. "Distinction", "2:1", "B". */
  name: string;
  /** Minimum percentage of the final grade to achieve this band (0–100). */
  min: number;
}

export interface GradingScheme {
  kind: "percentage" | "points" | "bands" | "letter";
  bands?: GradingBand[];
  passMark?: number | null;
  totalPoints?: number | null;
}

export interface DeliverableForProjection {
  /** % of final grade (0–100), or null when the material did not state it. */
  weight: number | null;
  /** Best % scored on this deliverable so far, or null when not yet graded. */
  bestPercentage: number | null;
}

export interface GradeProjection {
  /** Weighted average % over the GRADED portion only (0 when nothing graded). */
  weightedSoFar: number;
  /** Total weight (%) of the deliverables that have been graded. */
  weightAccountedFor: number;
  /** Band the `weightedSoFar` average currently falls in ("" when no scheme). */
  currentBand: string;
  /** The next band up + the average mark needed on remaining weight, or null. */
  toNextBand: { band: string; requiredAvgOnRemaining: number } | null;
}

function clampPct(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/** Highest band whose `min` is ≤ pct; "" when the scheme has no bands. */
export function bandOf(pct: number, scheme: GradingScheme | null): string {
  const bands = scheme?.bands;
  if (!bands || bands.length === 0) return "";
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  const hit = sorted.find((b) => pct >= b.min);
  // Below the lowest threshold → name the lowest band (e.g. "Fail").
  return hit?.name ?? sorted[sorted.length - 1].name;
}

/** The band immediately above `currentBand`, or null if already top / no scheme. */
function nextBandAbove(currentBand: string, scheme: GradingScheme | null): GradingBand | null {
  const bands = scheme?.bands;
  if (!bands || bands.length === 0) return null;
  const asc = [...bands].sort((a, b) => a.min - b.min);
  const idx = asc.findIndex((b) => b.name === currentBand);
  if (idx === -1) return asc[0] ?? null;
  return idx + 1 < asc.length ? asc[idx + 1] : null;
}

export function projectGrade(
  deliverables: DeliverableForProjection[],
  scheme: GradingScheme | null
): GradeProjection {
  const graded = deliverables.filter(
    (d): d is { weight: number; bestPercentage: number } =>
      d.weight != null && d.bestPercentage != null
  );

  const weightAccountedFor = graded.reduce((s, d) => s + d.weight, 0);
  const weightedSoFar =
    weightAccountedFor > 0
      ? graded.reduce((s, d) => s + d.weight * d.bestPercentage, 0) / weightAccountedFor
      : 0;

  const currentBand = bandOf(weightedSoFar, scheme);

  // Weight still to be graded (has a weight but no score yet).
  const ungradedWeight = deliverables
    .filter((d) => d.weight != null && d.bestPercentage == null)
    .reduce((s, d) => s + (d.weight as number), 0);

  const next = nextBandAbove(currentBand, scheme);
  let toNextBand: GradeProjection["toNextBand"] = null;
  if (next && ungradedWeight > 0) {
    // Contribution already locked in, as a fraction of the final grade.
    const gradedContribution = graded.reduce((s, d) => s + (d.weight / 100) * d.bestPercentage, 0);
    // X such that gradedContribution + (ungradedWeight/100)·X ≥ next.min.
    const requiredAvg = ((next.min - gradedContribution) * 100) / ungradedWeight;
    toNextBand = { band: next.name, requiredAvgOnRemaining: Math.round(clampPct(requiredAvg)) };
  }

  return {
    weightedSoFar: Math.round(weightedSoFar * 10) / 10,
    weightAccountedFor: Math.round(weightAccountedFor * 10) / 10,
    currentBand,
    toNextBand,
  };
}

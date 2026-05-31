/**
 * SM-2 spaced-repetition scheduler (pure, unit-testable).
 *
 * We deliberately ship classic SM-2 rather than FSRS: research shows the
 * bottleneck for retention is *card quality*, not the algorithm, and FSRS only
 * starts to beat SM-2 defaults after ~1,000 reviews of per-user history. SM-2 is
 * five lines of math, ships today, and lives behind this one function so it can
 * be swapped for FSRS later without touching callers.
 *
 * The four review buttons map to SM-2 "quality" scores:
 *   again = 2 (a lapse), hard = 3, good = 4, easy = 5.
 * A quality below 3 is a lapse: reset the interval, nudge the ease down, and
 * re-show the card in the same session. Otherwise grow the interval by the ease.
 *
 * Pure: never mutates its inputs and never reads the clock — `now` is injected so
 * scheduling is fully deterministic and testable.
 */

export type FlashcardRating = "again" | "hard" | "good" | "easy";

/** The SM-2 state carried on each card. */
export interface SrsState {
  reps: number;
  intervalDays: number;
  ease: number;
  lapses: number;
}

/** The next-review state SM-2 produces; persist these fields onto the card. */
export interface SrsUpdate extends SrsState {
  dueAt: Date;
}

const QUALITY: Record<FlashcardRating, number> = { again: 2, hard: 3, good: 4, easy: 5 };
const MIN_EASE = 1.3; // SM-2 floor — never let a hard card's ease collapse below this
const LAPSE_RELEARN_MINUTES = 10; // a failed card comes back within the session
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;

function addMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60_000);
}

/**
 * Computes the next schedule for a card given the user's self-rating. Returns a
 * fresh state object (the input card is never mutated).
 */
export function scheduleNext(card: SrsState, rating: FlashcardRating, now: Date): SrsUpdate {
  const q = QUALITY[rating];

  // Lapse: relearn soon, drop the ease, count the lapse, reset the streak.
  if (q < 3) {
    return {
      reps: 0,
      intervalDays: 0,
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      lapses: card.lapses + 1,
      dueAt: addMinutes(now, LAPSE_RELEARN_MINUTES),
    };
  }

  // Pass: standard SM-2 ease update, then grow the interval by the ease factor.
  const ease = Math.max(MIN_EASE, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const reps = card.reps + 1;
  const intervalDays =
    reps === 1
      ? FIRST_INTERVAL_DAYS
      : reps === 2
        ? SECOND_INTERVAL_DAYS
        : Math.max(1, Math.round(card.intervalDays * ease));

  return { reps, intervalDays, ease, lapses: card.lapses, dueAt: addDays(now, intervalDays) };
}

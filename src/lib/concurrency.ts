/**
 * Concurrency controls for heavy background work.
 *
 * Two independent limits:
 *  1. A GLOBAL semaphore on heavy LLM calls (trial-split chunks, mock batches,
 *     concept-map chunks, guide sections, course ingestion). The free proxy
 *     slows sharply under load and each in-flight call holds its prompt +
 *     response in this single Node process's memory, so without a ceiling a
 *     burst of uploads can melt the proxy or OOM the box. Interactive calls
 *     (chat / grade / explain) deliberately bypass this so they stay snappy.
 *  2. A PER-USER cap on simultaneously in-progress jobs, derived from the DB
 *     (stateless — survives restarts, never leaks a counter), so one user can't
 *     flood the queue.
 */

import { prisma } from "@/lib/prisma";

// ── 1. Global heavy-LLM semaphore ─────────────────────────────────────────────

const HEAVY_LLM_CONCURRENCY = Math.max(1, Number(process.env.HEAVY_LLM_CONCURRENCY) || 6);

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < HEAVY_LLM_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  // Hand the slot directly to the next waiter (active stays the same); only
  // decrement when nobody is waiting.
  if (next) next();
  else active = Math.max(0, active - 1);
}

/** Runs `fn` once a global heavy-LLM slot is free, always releasing the slot. */
export async function runHeavyLLM<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

// ── 2. Per-user in-progress job cap ───────────────────────────────────────────

const MAX_ACTIVE_JOBS_PER_USER = Math.max(1, Number(process.env.MAX_ACTIVE_JOBS_PER_USER) || 4);

/** Counts a user's currently in-progress background jobs across all features. */
export async function userActiveJobCount(userId: string): Promise<number> {
  const [trials, mocks, courses, guides] = await prisma.$transaction([
    prisma.examTrial.count({ where: { userId, status: "PARSING" } }),
    prisma.mockExam.count({ where: { status: "GENERATING", course: { userId } } }),
    prisma.course.count({ where: { userId, status: "PROCESSING" } }),
    prisma.studyGuide.count({ where: { status: { in: ["ANALYZING", "GENERATING"] }, course: { userId } } }),
  ]);
  return trials + mocks + courses + guides;
}

/**
 * True when the user is under the concurrent-job cap and may start another.
 * Soft cap (a small TOCTOU overshoot is harmless), kept stateless on purpose.
 */
export async function userHasJobCapacity(userId: string): Promise<boolean> {
  return (await userActiveJobCount(userId)) < MAX_ACTIVE_JOBS_PER_USER;
}

/**
 * Lightweight in-memory rate limiter (fixed window).
 *
 * Scoped to a single Node process — adequate for this app's single-instance
 * PM2 deployment. If the app is ever horizontally scaled, swap this for a
 * shared store (Redis). Keys are arbitrary strings (e.g. `"share:<ip>"`,
 * `"submit:<userId>"`).
 */

import type { NextRequest } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Records a hit for `key` and reports whether it is within the allowed rate.
 * Returns `ok: false` with a `retryAfterSec` hint when the limit is exceeded.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    if (buckets.size >= MAX_TRACKED_KEYS) sweepExpired(now);
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (existing.count >= opts.max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  // Immutable-style update: replace the bucket rather than mutating in place.
  buckets.set(key, { count: existing.count + 1, resetAt: existing.resetAt });
  return { ok: true, retryAfterSec: 0 };
}

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/**
 * Best-effort client IP from common proxy headers, falling back to a constant
 * so anonymous traffic still shares a bucket rather than bypassing limits.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

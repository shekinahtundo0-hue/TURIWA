import type { Request } from "express";

// Password guessing is the likeliest way into a chama app: numbers are public
// (everyone in a group knows each other's phone) and the payoff is other people's
// savings. Codes already die after five wrong tries; this is the same rule applied
// to the password field.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;
const BLOCK_MS = 15 * 60_000;
// One map per process, so it must not grow without bound if someone sprays keys.
const MAX_KEYS = 5000;

type Bucket = { failures: number; firstFailureAt: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();

function prune(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil < now && bucket.firstFailureAt + WINDOW_MS < now) buckets.delete(key);
  }
  if (buckets.size > MAX_KEYS) {
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (buckets.size <= MAX_KEYS) break;
    }
  }
}

/**
 * Seconds left on a lockout, or 0 when the caller may keep trying.
 */
export function retryAfterSeconds(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  const now = Date.now();
  if (bucket.blockedUntil > now) return Math.ceil((bucket.blockedUntil - now) / 1000);
  if (bucket.firstFailureAt + WINDOW_MS <= now) buckets.delete(key);
  return 0;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.firstFailureAt + WINDOW_MS <= now) {
    buckets.set(key, { failures: 1, firstFailureAt: now, blockedUntil: 0 });
  } else {
    bucket.failures += 1;
    if (bucket.failures >= MAX_FAILURES) bucket.blockedUntil = now + BLOCK_MS;
  }
  prune();
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}

/**
 * A key for an attempt at an account: the identifier when the form supplied one, so
 * rotating IPs cannot buy extra guesses, and the socket address as the fallback.
 */
export function attemptKey(scope: string, req: Request, identifier: string): string {
  const who = identifier.trim().toLowerCase() || req.ip || "unknown";
  return `${scope}:${who}`;
}

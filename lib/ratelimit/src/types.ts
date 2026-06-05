import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Drizzle Postgres database handle. Declared loosely so callers can pass
 * either the workspace's default `db` instance or a test-scoped one without
 * surfacing `@workspace/db`'s schema generic into this package's surface.
 *
 * The implementation only relies on `execute(sql)` so any drizzle Postgres
 * client works.
 */
export type RateLimiterDb = NodePgDatabase<Record<string, unknown>>;

/**
 * Result of a `consume` call.
 *
 * - `ok: true` — a token was deducted; the caller may proceed.
 * - `ok: false` — no tokens available; the caller should reject with
 *   `RATE_LIMITED` and surface `retryAfterSec` in the error response.
 *
 * `remaining` is the post-decrement bucket level (always ≥ 0).
 *
 * Validates: Requirements 14.1, 14.2
 */
export interface ConsumeResult {
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
}

/**
 * Rate-limit window classification used as an audit / reporting label on the
 * `rate_limit_buckets` row. The token-bucket math itself runs purely on the
 * `refillPerSec` rate; the window column is informational.
 */
export type RateLimitWindow = "hour" | "second";

/**
 * Heuristic: anything that refills at one or more tokens per second is a
 * `second`-scale bucket; slower refills (per-hour, per-day) are `hour`.
 *
 * Mirrors the design's two configured windows (10/hour, 30/hour, 5/sec).
 */
export function classifyWindow(refillPerSec: number): RateLimitWindow {
  return refillPerSec >= 1 ? "second" : "hour";
}

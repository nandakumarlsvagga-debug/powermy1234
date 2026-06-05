import { sql } from "drizzle-orm";

import {
  classifyWindow,
  type ConsumeResult,
  type RateLimiterDb,
} from "./types.js";

/**
 * Atomically attempt to spend one token from the named bucket.
 *
 * Token-bucket model:
 * - The bucket holds at most `capacity` tokens.
 * - Tokens accrue continuously at `refillPerSec` per second.
 * - Each successful consume deducts one token and resets `refilled_at` so the
 *   refill computation always references the most recent settled state.
 *
 * Algorithm:
 * 1. Idempotent UPSERT seeds the row at full capacity if it doesn't exist.
 *    Concurrent first-touches collapse via `ON CONFLICT DO NOTHING`, so
 *    callers cannot observe a missing row.
 * 2. A single `UPDATE ... RETURNING` then computes the refilled tokens from
 *    `refilled_at`, decrements one if `new_tokens >= 1`, and otherwise leaves
 *    the row unchanged. The CTE that computes `new_tokens` uses
 *    `SELECT ... FOR UPDATE` so the row is locked at CTE evaluation time —
 *    the lost-update race that would otherwise let two parallel transactions
 *    each consume the same "last" token cannot happen.
 *
 * Both database calls are async Promise-based; the JS event loop is never
 * blocked, satisfying Requirement 14.2's "never block the request loop"
 * constraint.
 *
 * Validates: Requirements 14.1, 14.2
 */
export async function consume(
  db: RateLimiterDb,
  bucketKey: string,
  capacity: number,
  refillPerSec: number,
): Promise<ConsumeResult> {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new RangeError(
      `consume: capacity must be a positive finite number, got ${capacity}`,
    );
  }
  if (!Number.isFinite(refillPerSec) || refillPerSec <= 0) {
    throw new RangeError(
      `consume: refillPerSec must be a positive finite number, got ${refillPerSec}`,
    );
  }

  const window = classifyWindow(refillPerSec);
  const capacityInt = Math.floor(capacity);

  // 1) First-touch UPSERT. Seeds at full `capacity` with `refilled_at = now()`
  //    so the immediately-following UPDATE computes refill ≈ 0 and decrements
  //    cleanly to `capacity - 1`. `ON CONFLICT DO NOTHING` is the right
  //    behavior here: if the row already exists, the UPDATE below will refill
  //    and decrement based on the current state.
  await db.execute(sql`
    INSERT INTO rate_limit_buckets (bucket_key, tokens, refilled_at, window)
    VALUES (
      ${bucketKey},
      ${capacityInt}::int,
      now(),
      ${window}::rate_limit_window
    )
    ON CONFLICT (bucket_key) DO NOTHING
  `);

  // 2) Atomic refill + decrement.
  //
  //    - The `refilled` CTE computes the post-refill token count from the
  //      stored `refilled_at` and `refillPerSec`, capped at `capacity`. The
  //      `FOR UPDATE` clause acquires a row-level lock at CTE evaluation
  //      time so the value read here is the same value the UPDATE writes
  //      against — without it, READ COMMITTED snapshot semantics would let
  //      two concurrent consumers each compute `new_tokens` from the same
  //      pre-decrement state and both succeed on the last token.
  //    - The UPDATE writes `new_tokens - 1` on success and leaves the row
  //      unchanged (tokens=0, refilled_at frozen) on failure, so a rejected
  //      consume does not lose accrued time.
  //    - RETURNING surfaces the post-decrement `tokens`, the boolean `ok`
  //      (derived from the pre-decrement count), and `pre_decrement` for
  //      auditability.
  const result = await db.execute(sql`
    WITH refilled AS (
      SELECT
        bucket_key,
        LEAST(
          ${capacityInt}::int,
          tokens + FLOOR(
            EXTRACT(EPOCH FROM (now() - refilled_at))
            * ${refillPerSec}::double precision
          )::int
        ) AS new_tokens
      FROM rate_limit_buckets
      WHERE bucket_key = ${bucketKey}
      FOR UPDATE
    )
    UPDATE rate_limit_buckets
    SET
      tokens = CASE
        WHEN r.new_tokens >= 1 THEN r.new_tokens - 1
        ELSE 0
      END,
      refilled_at = CASE
        WHEN r.new_tokens >= 1 THEN now()
        ELSE rate_limit_buckets.refilled_at
      END,
      window = ${window}::rate_limit_window
    FROM refilled r
    WHERE rate_limit_buckets.bucket_key = r.bucket_key
    RETURNING
      rate_limit_buckets.tokens AS tokens,
      (r.new_tokens >= 1) AS ok,
      r.new_tokens AS pre_decrement
  `);

  const row = readFirstRow(result);
  if (!row) {
    // Unreachable in practice: step 1 guarantees the row exists. If it ever
    // disappears between the upsert and the update (e.g. an external purge),
    // surface a clear error rather than silently returning a misleading
    // verdict.
    throw new Error(
      `rate limiter UPDATE returned no rows for bucket "${bucketKey}"`,
    );
  }

  const ok = row.ok === true;
  const remaining = Math.max(0, toInt(row.tokens));

  // Retry hint: the time it takes the bucket to accrue one full token at
  // `refillPerSec`. Round up so the caller never under-promises, and floor
  // at one second so very-low-rate buckets surface a sensible header value.
  const retryAfterSec = ok ? 0 : Math.max(1, Math.ceil(1 / refillPerSec));

  return { ok, retryAfterSec, remaining };
}

/**
 * Drizzle's `db.execute` returns the underlying `pg` `QueryResult` (with a
 * `.rows` array) when used against `node-postgres`. Some adapter or test
 * doubles return a plain array of rows; handle both shapes so callers can
 * inject either.
 */
function readFirstRow(
  result: unknown,
): Record<string, unknown> | undefined {
  if (Array.isArray(result)) {
    return result[0] as Record<string, unknown> | undefined;
  }
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows[0] as Record<string, unknown> | undefined;
    }
  }
  return undefined;
}

/**
 * `pg` returns numeric values as JS numbers for int4/int8 columns when they
 * fit, but as strings when they exceed JS-safe integer range. The bucket
 * `tokens` column is `int`, so values always fit, but normalize defensively.
 */
function toInt(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  if (typeof value === "bigint") return Number(value);
  return 0;
}

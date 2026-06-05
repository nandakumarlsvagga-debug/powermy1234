/**
 * Integration tests for `@workspace/ratelimit`'s `consume` against a real
 * Postgres instance booted via {@link https://node.testcontainers.org/ Testcontainers}.
 *
 * Requirement 14.1 (per-IP, per-Member, per-second rate limits) and
 * Requirement 14.2 ("never block the request loop", concurrent-safe) both
 * depend on the atomic `UPDATE ... RETURNING` semantics that only a real
 * Postgres can exercise — pg-mem and other in-memory shims do not implement
 * `FOR UPDATE` row-locking, transaction isolation, or `EXTRACT(EPOCH FROM …)`
 * the same way the production database does. Using Testcontainers gives the
 * suite the same rate-limiter behavior the API server will see in deploy.
 *
 * Suite layout:
 *   - `cap`               — a fresh bucket starts at `capacity` and decrements
 *                           one token per consume, never going below zero.
 *   - `refill`            — after time passes, accrued tokens become
 *                           available, capped at `capacity`.
 *   - `concurrent contention` — two parallel transactions racing for the
 *                           last token: exactly one wins.
 *   - `retryAfterSec correctness` — the hint is `0` on success and
 *                           `ceil(1 / refillPerSec)` (≥ 1) on rejection.
 *
 * Skip behavior: when Docker is unavailable in the host environment, the
 * `beforeAll` hook records a skip reason and `describe.skipIf` short-circuits
 * the entire file so unit-test runs on machines without Docker remain green.
 *
 * Validates: Requirements 14.1, 14.2
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { consume } from "../src/consume.js";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Container lifecycle
// ---------------------------------------------------------------------------

/**
 * Pinned Postgres image. Aligns with the Supabase production minor (15.x is
 * the Supabase default at time of writing) so the SQL surface the limiter
 * relies on (`EXTRACT(EPOCH FROM …)`, `FOR UPDATE`, `ON CONFLICT`) matches
 * production exactly.
 */
const POSTGRES_IMAGE = "postgres:15-alpine";

/**
 * Hard ceilings for container startup and shutdown. Pulling the image on a
 * cold host can take longer than vitest's default 5 s timeout, so we set
 * generous bounds here. The actual container should be ready in well under
 * these.
 */
const CONTAINER_BOOT_MS = 120_000;
const CONTAINER_STOP_MS = 30_000;

let container: StartedPostgreSqlContainer | null = null;
let pool: pg.Pool | null = null;
let db: NodePgDatabase<Record<string, unknown>> | null = null;

/**
 * Reason the suite was skipped, surfaced into vitest output so a failing
 * environment is obvious. Empty string ⇒ run normally.
 */
let skipReason = "";

beforeAll(async () => {
  try {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase("ratelimit_test")
      .withUsername("test")
      .withPassword("test")
      .start();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool);

    // Install the minimum schema the limiter touches. The production schema
    // lives in `@workspace/db`, but this package is decoupled from it on
    // purpose: the test exercises the SQL the limiter writes, not the
    // wider Drizzle table definitions. Mirroring the DDL here keeps the
    // integration suite hermetic and robust to unrelated schema changes.
    await db.execute(sql`
      CREATE TYPE rate_limit_window AS ENUM ('hour', 'second');
    `);
    await db.execute(sql`
      CREATE TABLE rate_limit_buckets (
        bucket_key  text PRIMARY KEY NOT NULL,
        tokens      integer NOT NULL,
        refilled_at timestamptz NOT NULL DEFAULT now(),
        window      rate_limit_window NOT NULL
      );
    `);
  } catch (error) {
    // The most common cause is "Docker is not running" / "cannot connect to
    // the Docker daemon". Capture the message so vitest reports a precise
    // skip reason rather than a generic "tests skipped".
    skipReason = `Docker unavailable: ${(error as Error).message}`;
    if (pool) await pool.end().catch(() => undefined);
    if (container) await container.stop().catch(() => undefined);
    container = null;
    pool = null;
    db = null;
  }
}, CONTAINER_BOOT_MS);

afterAll(async () => {
  if (pool) await pool.end().catch(() => undefined);
  if (container) await container.stop().catch(() => undefined);
}, CONTAINER_STOP_MS);

beforeEach(async () => {
  // Each test starts from an empty bucket table so consume's first-touch
  // upsert is the only thing seeding rows. This is faster than DROP +
  // CREATE and keeps the enum / table cached between tests.
  if (db) {
    await db.execute(sql`TRUNCATE TABLE rate_limit_buckets;`);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a bucket directly. Used to verify post-conditions that aren't
 * covered by the public `ConsumeResult` return — e.g. that the row exists
 * after a first-touch consume, that `refilled_at` is updated only on
 * success, and that `tokens` clamps at zero.
 */
async function readBucket(bucketKey: string): Promise<
  | {
      bucket_key: string;
      tokens: number;
      refilled_at: Date;
      window: "hour" | "second";
    }
  | null
> {
  if (!db) throw new Error("db not initialized");
  const result = await db.execute(sql`
    SELECT bucket_key, tokens, refilled_at, window
    FROM rate_limit_buckets
    WHERE bucket_key = ${bucketKey};
  `);
  // node-postgres returns the QueryResult shape; rows is typed as unknown[].
  const rows = (result as unknown as { rows: unknown[] }).rows;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    bucket_key: row.bucket_key as string,
    tokens: Number(row.tokens),
    refilled_at: new Date(row.refilled_at as string | Date),
    window: row.window as "hour" | "second",
  };
}

/**
 * Backdate a bucket's `refilled_at` by `seconds` seconds. The bucket must
 * already exist (created by a prior `consume`). Used to simulate the
 * passage of time without sleeping the test runner — a real-time wait
 * would push container-bounded suites over the per-test budget.
 */
async function backdateBucket(bucketKey: string, seconds: number): Promise<void> {
  if (!db) throw new Error("db not initialized");
  await db.execute(sql`
    UPDATE rate_limit_buckets
    SET refilled_at = refilled_at - (${seconds}::int || ' seconds')::interval
    WHERE bucket_key = ${bucketKey};
  `);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Skip the whole suite when Docker is unavailable. The condition is computed
// after `beforeAll` has run so `skipReason` reflects the real outcome of the
// container start. `describe.skipIf` is the supported way to do this in
// vitest 2.x.
describe.skipIf(() => skipReason !== "")(
  "ratelimit consume — integration",
  () => {
    describe("cap", () => {
      it("first consume on a fresh bucket returns ok with capacity-1 tokens remaining", async () => {
        const result = await consume(db!, "scan:ip:cap-fresh", 5, 5 / 3600);

        expect(result.ok).toBe(true);
        expect(result.remaining).toBe(4);
        expect(result.retryAfterSec).toBe(0);

        const row = await readBucket("scan:ip:cap-fresh");
        expect(row).not.toBeNull();
        expect(row!.tokens).toBe(4);
        // The first consume's window classification matches the design's
        // per-hour bucket convention for `< 1 token/sec` refill rates.
        expect(row!.window).toBe("hour");
      });

      it("decrements one token per consume and rejects once the bucket is empty", async () => {
        const key = "scan:ip:cap-drain";
        // Cap of 3 with a slow refill so all three consumes happen within
        // the same epoch and no refill kicks in mid-test.
        const refillPerSec = 1 / 3600;

        const a = await consume(db!, key, 3, refillPerSec);
        const b = await consume(db!, key, 3, refillPerSec);
        const c = await consume(db!, key, 3, refillPerSec);
        const d = await consume(db!, key, 3, refillPerSec);

        expect(a.ok).toBe(true);
        expect(a.remaining).toBe(2);
        expect(b.ok).toBe(true);
        expect(b.remaining).toBe(1);
        expect(c.ok).toBe(true);
        expect(c.remaining).toBe(0);
        expect(d.ok).toBe(false);
        expect(d.remaining).toBe(0);
        // 1 / (1/3600) = 3600 → ceil → 3600 seconds before another token.
        expect(d.retryAfterSec).toBe(3600);

        const row = await readBucket(key);
        expect(row!.tokens).toBe(0);
      });

      it("never refills above the configured capacity", async () => {
        const key = "scan:ip:cap-clamp";
        const capacity = 4;
        const refillPerSec = 1; // one token per second

        // Seed the bucket with one consume → capacity-1 = 3 tokens.
        await consume(db!, key, capacity, refillPerSec);

        // Backdate refilled_at by 60 seconds. At 1 token/sec that would
        // notionally accrue 60 tokens, but the limiter must clamp at the
        // configured capacity.
        await backdateBucket(key, 60);

        const after = await consume(db!, key, capacity, refillPerSec);
        // After clamping to capacity (4) and decrementing one, we expect 3.
        expect(after.ok).toBe(true);
        expect(after.remaining).toBe(3);
        const row = await readBucket(key);
        expect(row!.tokens).toBe(3);
      });
    });

    describe("refill", () => {
      it("accrues tokens over time and a previously-rejected bucket can consume again", async () => {
        const key = "scan:ip:refill-accrue";
        const refillPerSec = 0.5; // one token per 2 seconds

        // Drain a 1-token bucket.
        const first = await consume(db!, key, 1, refillPerSec);
        expect(first.ok).toBe(true);
        expect(first.remaining).toBe(0);

        // No time has passed → next consume rejected.
        const blocked = await consume(db!, key, 1, refillPerSec);
        expect(blocked.ok).toBe(false);
        // ceil(1 / 0.5) = 2 seconds.
        expect(blocked.retryAfterSec).toBe(2);

        // Backdate by 3 seconds → 1.5 tokens of refill, clamped to capacity 1.
        await backdateBucket(key, 3);

        const refilled = await consume(db!, key, 1, refillPerSec);
        expect(refilled.ok).toBe(true);
        expect(refilled.remaining).toBe(0);
      });

      it("partial refills below one full token leave the bucket empty and rejected", async () => {
        const key = "scan:ip:refill-partial";
        const refillPerSec = 0.1; // one token every 10 seconds

        await consume(db!, key, 1, refillPerSec); // drains to 0
        // Backdate by 5 seconds → only 0.5 tokens of refill, FLOOR ⇒ 0.
        await backdateBucket(key, 5);

        const stillBlocked = await consume(db!, key, 1, refillPerSec);
        expect(stillBlocked.ok).toBe(false);
        expect(stillBlocked.remaining).toBe(0);
        // `ceil(1 / 0.1) = 10`.
        expect(stillBlocked.retryAfterSec).toBe(10);
      });

      it("on rejection, refilled_at is preserved so accrued sub-token time is not lost", async () => {
        const key = "scan:ip:refill-preserve";
        const refillPerSec = 0.1;

        await consume(db!, key, 1, refillPerSec); // drains to 0, refilled_at = now
        const drainedAt = (await readBucket(key))!.refilled_at;

        // Backdate slightly less than one token's worth of accrual.
        await backdateBucket(key, 5);
        const afterBackdate = (await readBucket(key))!.refilled_at;

        const blocked = await consume(db!, key, 1, refillPerSec);
        expect(blocked.ok).toBe(false);
        // The rejection must NOT reset refilled_at; otherwise the next
        // `backdate(10)` would still see refilled_at advanced and the user
        // would never see a token accrue.
        const after = (await readBucket(key))!.refilled_at;
        expect(after.getTime()).toBe(afterBackdate.getTime());
        // And refilled_at is older than the original consume — i.e. the
        // backdate is still in effect.
        expect(after.getTime()).toBeLessThan(drainedAt.getTime());
      });
    });

    describe("concurrent consume contention", () => {
      it("two parallel transactions racing for the last token: exactly one wins", async () => {
        const key = "scan:ip:race-last-token";
        const refillPerSec = 1 / 3600;

        // Seed the bucket at exactly 1 token by consuming once on a 2-cap
        // bucket (post: 1 token), then immediately overwrite tokens to 1
        // and forward refilled_at so no refill can happen during the race.
        await consume(db!, key, 2, refillPerSec);
        await db!.execute(sql`
          UPDATE rate_limit_buckets
          SET tokens = 1, refilled_at = now()
          WHERE bucket_key = ${key};
        `);

        // Fire both consumes simultaneously. The atomic CTE (`SELECT ... FOR
        // UPDATE` + `UPDATE ... RETURNING`) must serialize them; one sees
        // pre-decrement tokens = 1 and decrements to 0, the other sees 0
        // and rejects.
        const [a, b] = await Promise.all([
          consume(db!, key, 2, refillPerSec),
          consume(db!, key, 2, refillPerSec),
        ]);

        const winners = [a, b].filter((r) => r.ok);
        const losers = [a, b].filter((r) => !r.ok);
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(1);
        expect(winners[0]!.remaining).toBe(0);
        expect(losers[0]!.remaining).toBe(0);
        expect(losers[0]!.retryAfterSec).toBeGreaterThan(0);

        const row = await readBucket(key);
        expect(row!.tokens).toBe(0);
      });

      it("a burst of N parallel consumes against a capacity-N bucket succeeds exactly N times", async () => {
        const key = "scan:ip:race-burst";
        const capacity = 5;
        const refillPerSec = 1 / 3600;

        const bursts = await Promise.all(
          Array.from({ length: capacity + 3 }, () =>
            consume(db!, key, capacity, refillPerSec),
          ),
        );

        const okCount = bursts.filter((r) => r.ok).length;
        const failCount = bursts.filter((r) => !r.ok).length;
        expect(okCount).toBe(capacity);
        expect(failCount).toBe(3);

        // Every successful consume reports a non-negative remaining and the
        // sequence of remaining values, when sorted descending, equals
        // [capacity-1, capacity-2, ..., 0]. Concurrency may interleave
        // observed remaining values between calls, so we only assert the
        // multiset equality, not call-by-call order.
        const okRemaining = bursts
          .filter((r) => r.ok)
          .map((r) => r.remaining)
          .sort((x, y) => y - x);
        expect(okRemaining).toEqual([4, 3, 2, 1, 0]);

        const row = await readBucket(key);
        expect(row!.tokens).toBe(0);
      });
    });

    describe("retryAfterSec correctness", () => {
      it("returns 0 on success", async () => {
        const r = await consume(db!, "scan:ip:retry-ok", 2, 1 / 3600);
        expect(r.ok).toBe(true);
        expect(r.retryAfterSec).toBe(0);
      });

      it("returns ceil(1 / refillPerSec) on rejection for sub-second refill rates", async () => {
        const key = "scan:ip:retry-hour";
        // 10 tokens/hour ⇒ 10/3600 ≈ 0.00278 tokens/sec ⇒ 360 sec/token.
        const refillPerSec = 10 / 3600;

        await consume(db!, key, 1, refillPerSec); // drain
        const blocked = await consume(db!, key, 1, refillPerSec);
        expect(blocked.ok).toBe(false);
        expect(blocked.retryAfterSec).toBe(Math.ceil(1 / refillPerSec)); // 360
      });

      it("returns at least 1 on rejection for fast (≥1/sec) refill rates", async () => {
        const key = "scan:ip:retry-second";
        const refillPerSec = 5; // 5 tokens/sec ⇒ ceil(1/5) = 1, floored at 1.

        await consume(db!, key, 1, refillPerSec); // drain
        const blocked = await consume(db!, key, 1, refillPerSec);
        expect(blocked.ok).toBe(false);
        // 1/5 = 0.2 → ceil = 1, but `consume` floors at 1 explicitly so
        // ultra-fast refills still surface a sensible Retry-After value.
        expect(blocked.retryAfterSec).toBe(1);
      });

      it("retryAfterSec is monotonically non-increasing in refillPerSec", async () => {
        // Independent buckets at three refill rates: slow, medium, fast.
        const slow = 1 / 3600; // 1/hour
        const medium = 1 / 60; // 1/minute
        const fast = 1; // 1/second

        for (const [k, rate] of [
          ["scan:ip:retry-slow", slow],
          ["scan:ip:retry-medium", medium],
          ["scan:ip:retry-fast", fast],
        ] as const) {
          await consume(db!, k, 1, rate); // drain
        }

        const slowBlocked = await consume(db!, "scan:ip:retry-slow", 1, slow);
        const mediumBlocked = await consume(db!, "scan:ip:retry-medium", 1, medium);
        const fastBlocked = await consume(db!, "scan:ip:retry-fast", 1, fast);

        expect(slowBlocked.ok).toBe(false);
        expect(mediumBlocked.ok).toBe(false);
        expect(fastBlocked.ok).toBe(false);

        expect(slowBlocked.retryAfterSec).toBeGreaterThanOrEqual(
          mediumBlocked.retryAfterSec,
        );
        expect(mediumBlocked.retryAfterSec).toBeGreaterThanOrEqual(
          fastBlocked.retryAfterSec,
        );
      });
    });
  },
);

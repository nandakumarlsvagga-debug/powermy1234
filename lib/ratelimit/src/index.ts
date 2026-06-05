/**
 * `@workspace/ratelimit` — Postgres-backed token-bucket rate limiter.
 *
 * Buckets are persisted in the `rate_limit_buckets` table so serverless
 * function instances share state. The `consume` primitive is the one and
 * only public surface; callers compose it with their own bucket-key naming
 * (e.g. `scan:ip:{ip}`, `share:ip:{ip}`).
 *
 * Validates: Requirements 14.1, 14.2
 */

import { consume } from "./consume.js";
import type { ConsumeResult, RateLimiterDb } from "./types.js";

export { consume } from "./consume.js";
export type {
  ConsumeResult,
  RateLimitWindow,
  RateLimiterDb,
} from "./types.js";
export { classifyWindow } from "./types.js";

export interface CreateRateLimiterOptions {
  db: RateLimiterDb;
}

export interface RateLimiter {
  consume(
    bucketKey: string,
    capacity: number,
    refillPerSec: number,
  ): Promise<ConsumeResult>;
}

/**
 * Convenience factory that binds a `RateLimiterDb` and exposes a `consume`
 * method without the db parameter. Useful for the API server, which wires a
 * single DB handle once at startup.
 *
 * Mirrors the dependency-injection pattern used by `lib/moderation` (SDK
 * client passed in via constructor) so the package never reaches for a
 * global `db` singleton.
 */
export function createRateLimiter(options: CreateRateLimiterOptions): RateLimiter {
  const { db } = options;
  return {
    consume: (bucketKey, capacity, refillPerSec) =>
      consume(db, bucketKey, capacity, refillPerSec),
  };
}

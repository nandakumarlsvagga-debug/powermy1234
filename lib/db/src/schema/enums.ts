import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared Postgres enums used across multiple tables.
 *
 * Keep these centralized so column declarations in `scans`, `likes`,
 * `rate_limit_buckets`, etc. all reference the same `pgEnum` instance and
 * Drizzle emits a single CREATE TYPE per enum.
 */

export const categoryEnum = pgEnum("category", [
  "SETUPS",
  "FITNESS",
  "DRIP",
  "PETS",
  "RIDES",
  "WILDCARD",
]);

export const tierEnum = pgEnum("tier", [
  "D",
  "C",
  "B",
  "A",
  "S",
  "SS",
  "SSS",
  "LIMITLESS",
]);

export const anomalyTypeEnum = pgEnum("anomaly_type", [
  "POWER_SURGE_DETECTED",
  "FORBIDDEN_AURA",
  "SCOUTER_FAILURE",
  "UNREGISTERED_ENERGY",
  "CHAOS_SPIKE",
]);

export const commentarySourceEnum = pgEnum("commentary_source", [
  "model",
  "fallback",
]);

export const rateLimitWindowEnum = pgEnum("rate_limit_window", [
  "hour",
  "second",
]);

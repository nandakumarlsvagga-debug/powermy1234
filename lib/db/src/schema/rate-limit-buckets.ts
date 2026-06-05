import {
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { rateLimitWindowEnum } from "./enums";

/**
 * Token-bucket accounting shared across serverless function instances.
 *
 * One row per logical bucket. The application updates `tokens` and
 * `refilled_at` atomically with a single `UPDATE ... RETURNING` so
 * concurrent consumers cannot both spend the last token.
 *
 * Bucket key examples:
 *   - `scan:ip:1.2.3.4`
 *   - `scan:member:{uuid}`
 *   - `share:ip:1.2.3.4`
 *
 * Validates: Requirements 14.1, 14.2
 */
export const rateLimitBucketsTable = pgTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey().notNull(),
  tokens: integer("tokens").notNull(),
  refilledAt: timestamp("refilled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  window: rateLimitWindowEnum("window").notNull(),
});

export const insertRateLimitBucketSchema = createInsertSchema(
  rateLimitBucketsTable,
);
export type InsertRateLimitBucket = z.infer<typeof insertRateLimitBucketSchema>;
export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;

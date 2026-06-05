import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { membersTable } from "./members";
import { scansTable } from "./scans";

/**
 * Per-visitor like state on Feed entries. Toggle-style:
 * presence of a row means "liked".
 *
 * Either `member_id` or `anon_session_id` must be non-null. The
 * "one like per visitor per scan" invariant is enforced via two
 * partial unique indexes; a single PRIMARY KEY can't express the
 * COALESCE form used in the design.
 *
 * Validates: Requirement 11.3
 */
export const likesTable = pgTable(
  "likes",
  {
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scansTable.id, { onDelete: "cascade" }),

    memberId: uuid("member_id").references(() => membersTable.id, {
      onDelete: "cascade",
    }),

    anonSessionId: uuid("anon_session_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One like per (scan, member).
    uniqueIndex("likes_scan_member_uq")
      .on(t.scanId, t.memberId)
      .where(sql`${t.memberId} IS NOT NULL`),

    // One like per (scan, anon session).
    uniqueIndex("likes_scan_anon_uq")
      .on(t.scanId, t.anonSessionId)
      .where(sql`${t.anonSessionId} IS NOT NULL`),

    // Lookup by scan for like-count aggregation.
    index("likes_scan_idx").on(t.scanId),
  ],
);

export const insertLikeSchema = createInsertSchema(likesTable).omit({
  createdAt: true,
});

export type InsertLike = z.infer<typeof insertLikeSchema>;
export type Like = typeof likesTable.$inferSelect;

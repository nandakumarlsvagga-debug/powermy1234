import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { membersTable } from "./members";

/**
 * Per-Member daily counter, used to enforce the 25/day Member limit and
 * to display "time remaining until reset". Anonymous daily limit
 * (1/day) is computed by querying `scans.anon_session_id` against the
 * local-time-zone day boundary submitted by the client and is NOT
 * stored here.
 *
 * Validates: Requirements 9.4, 9.5
 */
export const dailyScanCountsTable = pgTable(
  "daily_scan_counts",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),

    /** UTC calendar day (Requirement 9.4 anchors the window to UTC). */
    utcDay: date("utc_day").notNull(),

    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({
      name: "daily_scan_counts_pk",
      columns: [t.memberId, t.utcDay],
    }),
    check("daily_scan_counts_count_nonneg", sql`${t.count} >= 0`),
    check("daily_scan_counts_count_cap", sql`${t.count} <= 25`),
  ],
);

export const insertDailyScanCountSchema = createInsertSchema(
  dailyScanCountsTable,
);
export type InsertDailyScanCount = z.infer<typeof insertDailyScanCountSchema>;
export type DailyScanCount = typeof dailyScanCountsTable.$inferSelect;

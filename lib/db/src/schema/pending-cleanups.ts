import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Deferred cleanup ledger for storage objects that were uploaded
 * before the matching `scans` insert succeeded.
 *
 * The pipeline writes one row here ahead of the storage upload, then
 * deletes the row after the `scans` insert commits. The Pending
 * Cleanup Reconciler job (every 10 minutes) deletes orphaned storage
 * objects for any rows older than its threshold whose paired Scan
 * never landed.
 *
 * Validates: Requirements 2.7, 2.8
 */
export const pendingCleanupsTable = pgTable(
  "pending_cleanups",
  {
    id: uuid("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),

    /**
     * The Scan id we intended to write. Not a foreign key — by design
     * the row is created BEFORE the `scans` insert, and the insert
     * may never land.
     */
    scanId: uuid("scan_id").notNull(),

    /** Storage key for the processed image, if uploaded. */
    imageObjectKey: text("image_object_key"),

    /** Storage key for the 480px thumbnail, if uploaded. */
    thumbnailObjectKey: text("thumbnail_object_key"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Reconciler job scans by created_at to find stale orphans.
    index("pending_cleanups_created_idx").on(t.createdAt),
  ],
);

export const insertPendingCleanupSchema = createInsertSchema(
  pendingCleanupsTable,
);
export type InsertPendingCleanup = z.infer<typeof insertPendingCleanupSchema>;
export type PendingCleanup = typeof pendingCleanupsTable.$inferSelect;

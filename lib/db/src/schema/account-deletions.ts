import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Audit row for `DELETE /api/me`. Written before the deletion
 * transaction runs so a compliance follow-up can confirm the
 * deletion event even if the transaction itself is the last
 * thing to touch the row's owning member.
 *
 * `member_id_hash` is the SHA-256 of the deleted member's id —
 * we keep proof-of-deletion without retaining a re-linkable id.
 *
 * Validates: Requirement 2.10
 */
export const accountDeletionsTable = pgTable("account_deletions", {
  id: uuid("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),

  memberIdHash: text("member_id_hash").notNull(),

  deletedAt: timestamp("deleted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAccountDeletionSchema = createInsertSchema(
  accountDeletionsTable,
);
export type InsertAccountDeletion = z.infer<typeof insertAccountDeletionSchema>;
export type AccountDeletion = typeof accountDeletionsTable.$inferSelect;

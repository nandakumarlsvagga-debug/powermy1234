import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Member account.
 *
 * Created on first OAuth sign-in. `id` matches the Supabase
 * `auth.users.id` so JWT-derived `auth.uid()` is the join key.
 *
 * Username is immutable after first save (enforced at the API
 * layer; the DB only enforces uniqueness and case-insensitive
 * uniqueness).
 *
 * Validates: Requirement 9.2
 */
export const membersTable = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().notNull(),
    username: text("username").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("members_username_uq").on(t.username),
    // Case-insensitive uniqueness so e.g. `alice` and `Alice` cannot both exist.
    uniqueIndex("members_username_lower_uq").on(sql`lower(${t.username})`),
  ],
);

export const insertMemberSchema = createInsertSchema(membersTable, {
  username: z.string().regex(/^[a-z0-9_]{3,20}$/),
}).omit({ createdAt: true, deletedAt: true });

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;

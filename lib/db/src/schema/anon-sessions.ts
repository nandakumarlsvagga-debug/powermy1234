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
 * Browser-bound anonymous identity. Created on first visit via the
 * signed `plvl_anon` cookie and a stable browser fingerprint.
 *
 * Used for:
 *   - daily-limit enforcement (1 anonymous Scan per local day)
 *   - soft-auth claim ("this Scan was created by this anon session,
 *     and the same browser just signed in, so attach it to the
 *     resulting Member account")
 *
 * Validates: Requirement 1.2
 */
export const anonSessionsTable = pgTable(
  "anon_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),

    /** Hash of stable browser signals (no IP). */
    fingerprint: text("fingerprint").notNull(),

    cookieSetAt: timestamp("cookie_set_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** IANA tz reported by the client at session creation. */
    localTz: text("local_tz"),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("anon_sessions_fingerprint_idx").on(t.fingerprint)],
);

export const insertAnonSessionSchema = createInsertSchema(anonSessionsTable);
export type InsertAnonSession = z.infer<typeof insertAnonSessionSchema>;
export type AnonSession = typeof anonSessionsTable.$inferSelect;

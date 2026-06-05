import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import {
  anomalyTypeEnum,
  categoryEnum,
  commentarySourceEnum,
  tierEnum,
} from "./enums";
import { membersTable } from "./members";

/**
 * Scan row. The single transactional point of the scanner pipeline.
 *
 * Created at the start of the pipeline, mutated only to fill in
 * derived fields (score, tier, anomaly, commentary, member ownership
 * on claim). IDs are surfaced verbatim in the public permalink, so
 * they are generated via `crypto.randomUUID()` to keep them
 * unguessable.
 *
 * Validates: Requirements 2.7, 2.8, 2.9, 2.10, 6.1, 6.2, 10.3, 10.4, 11.3
 */
export const scansTable = pgTable(
  "scans",
  {
    id: uuid("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),

    /** FK to `members.id`. Null for unclaimed Anonymous Scans. */
    memberId: uuid("member_id").references(() => membersTable.id, {
      onDelete: "cascade",
    }),

    /** Browser-bound session id (cookie). Used for soft-auth claim. */
    anonSessionId: uuid("anon_session_id"),

    category: categoryEnum("category").notNull(),

    /** Sanitized; <= 120 chars at the application layer. */
    description: text("description"),

    /** Final score after anomaly modifier; 1000..100000 */
    score: integer("score").notNull(),

    tier: tierEnum("tier").notNull(),

    /** `{ aura, power, status, threat }` each 0..10000 */
    coreStats: jsonb("core_stats").notNull(),

    /** Five keys, depend on category; each value 0..10000 */
    categoryStats: jsonb("category_stats").notNull(),

    /** 8..14 word commentary line (post slop detector / fallback) */
    commentary: text("commentary").notNull(),

    commentarySource: commentarySourceEnum("commentary_source").notNull(),

    anomalyType: anomalyTypeEnum("anomaly_type"),

    /**
     * Applied anomaly modifier in the inclusive range -15.00 .. +15.00,
     * persisted for audit and PBT clamping invariants.
     */
    anomalyModifierPct: numeric("anomaly_modifier_pct", {
      precision: 4,
      scale: 2,
    }),

    /** Score before anomaly modifier; needed for property-test invariants. */
    scorePreAnomaly: integer("score_pre_anomaly").notNull(),

    /** Full Pass 1 output for audit and future re-rendering. */
    culturalReading: jsonb("cultural_reading"),

    /** Verdict noun selected from Block O pool. */
    verdictNoun: text("verdict_noun").notNull(),

    /** Audit log of modifiers applied during Pass 2. */
    modifiersApplied: jsonb("modifiers_applied"),

    /** Score before modifiers are applied. */
    scorePreModifiers: integer("score_pre_modifiers").notNull(),

    /** Supabase Storage key for processed image. */
    imageObjectKey: text("image_object_key").notNull(),

    /** Supabase Storage key for 480px thumbnail. */
    thumbnailObjectKey: text("thumbnail_object_key").notNull(),

    /** pHash; deterministic neutral-fallback seed input. */
    imagePerceptualHash: text("image_perceptual_hash").notNull(),

    /** Raw structured Vision Model output (debugging only; redacted at INFO). */
    modelResponse: jsonb("model_response"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Set on Anonymous Scans (created_at + 30 days). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /** Set when the image purge job has run. */
    expiredAt: timestamp("expired_at", { withTimezone: true }),
  },
  (t) => [
    // Leaderboard tiebreak: equal scores sorted by earlier created_at.
    index("scans_score_created_idx").on(t.score.desc(), t.createdAt.asc()),

    // Per-Category leaderboards.
    index("scans_category_score_created_idx").on(
      t.category,
      t.score.desc(),
      t.createdAt.asc(),
    ),

    // Public Feed ordering.
    index("scans_created_at_desc_idx").on(t.createdAt.desc()),

    // Profile history per member.
    index("scans_member_created_idx").on(t.memberId, t.createdAt.desc()),

    // Daily-limit checks for anonymous visitors.
    index("scans_anon_session_created_idx").on(
      t.anonSessionId,
      t.createdAt.desc(),
    ),

    // Partial purge index for the anonymous-scan expiry job.
    index("scans_purge_idx")
      .on(t.expiresAt)
      .where(sql`${t.expiresAt} IS NOT NULL AND ${t.expiredAt} IS NULL`),

    // Score band invariant.
    check("scans_score_range", sql`${t.score} BETWEEN 1000 AND 100000`),

    // Pre-anomaly score band invariant (must also fall in [1000, 100000]).
    check(
      "scans_score_pre_anomaly_range",
      sql`${t.scorePreAnomaly} BETWEEN 1000 AND 100000`,
    ),

    // Every Scan belongs to either a Member or an anon session (or both
    // briefly during the claim transition). Encodes the design's
    // `(member_id IS NULL) <> (anon_session_id IS NULL OR member_id IS NOT NULL)`
    // which simplifies to "at least one of member_id, anon_session_id is set".
    check(
      "scans_owner_present",
      sql`(${t.memberId} IS NULL) <> (${t.anonSessionId} IS NULL OR ${t.memberId} IS NOT NULL)`,
    ),

    // Tier must match score band. `derive_tier` is created in migration 0001
    // (task 1.3) before this constraint is enforced.
    check(
      "scans_tier_matches_score",
      sql`${t.tier} = derive_tier(${t.score})`,
    ),
  ],
);

export const insertScanSchema = createInsertSchema(scansTable).omit({
  createdAt: true,
});

export type InsertScan = z.infer<typeof insertScanSchema>;
export type Scan = typeof scansTable.$inferSelect;

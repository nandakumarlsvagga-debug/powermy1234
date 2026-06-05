/**
 * Deterministic scoring core.
 *
 * Pure functions. Same inputs always produce the same outputs. No I/O, no
 * randomness here — randomness for the Anomaly engine lives in `anomaly.ts`
 * and is seeded explicitly. The functions here are the single source of truth
 * for Score, Tier, and Stat derivation across the API server, the share-card
 * renderer, and the property tests.
 *
 * Design references:
 *   - Requirement 6.1 score range [1000, 100000]
 *   - Requirement 6.2 tier bands
 *   - Requirement 6.3 stats are integers in [0, 10000]
 *   - Requirement 6.4 deterministic compute
 *   - Requirement 6.5 distribution targets
 *   - Requirement 6.6, 6.7 per-category stat names
 */

import { CATEGORY_STATS } from "./category-stats.js";
import type {
  Category,
  CategoryStats,
  CoreStats,
  ScoringInput,
  Tier,
  TraitConfidences,
} from "./types.js";

/**
 * Inclusive score range. Both bounds are persisted into the `scans` table as
 * a CHECK constraint; the constants here are the single in-tree source of
 * truth so the migration and the runtime always agree.
 */
export const MIN_SCORE = 1000;
export const MAX_SCORE = 100000;

/**
 * Inclusive stat range. Stats are emitted to the API surface and rendered on
 * the Share Card; integers in [0, 10000] (Requirement 6.3).
 */
export const MIN_STAT = 0;
export const MAX_STAT = 10000;

/**
 * Core stat weights. The four Core Stats sum to `1 - CATEGORY_WEIGHT_TOTAL`,
 * and the five Category Stats together contribute the remaining weight, so
 * the full stat budget normalizes to 1.0 (Property 7).
 *
 * Tuning rationale: AURA is the most "felt" stat across categories, so it
 * carries the largest single core weight; THREAT and POWER trail it; STATUS
 * is intentionally smaller because every category already supplies a status
 * analogue inside its five-stat bundle.
 */
export const CORE_WEIGHTS: Readonly<Record<keyof CoreStats, number>> = {
  aura: 0.18,
  power: 0.14,
  status: 0.1,
  threat: 0.13,
} as const;

/**
 * Total weight allocated to the five Category Stats. Each individual category
 * stat contributes `CATEGORY_WEIGHT_TOTAL / 5`. Combined with `CORE_WEIGHTS`
 * the full vector sums to 1.0 — verified by `Property 7: Score Weights
 * Normalize to 1`.
 */
export const CATEGORY_WEIGHT_TOTAL = 0.45 as const;

/** Convenience: per-category-stat weight (each of the five). */
export const CATEGORY_WEIGHT_EACH = CATEGORY_WEIGHT_TOTAL / 5;

/**
 * Map a Vision Model trait confidence (`1..10` integer) onto a stat value in
 * the inclusive range `[0, 10000]`.
 *
 * The mapping is the affine transform that pins `1 → 0` and `10 → 10000`,
 * with intermediate confidences spaced evenly. Because the input is
 * constrained to `1..10`, the output is always a clean integer multiple of
 * `MAX_STAT / 9` rounded to the nearest integer; over the full input domain
 * this guarantees the output lands in `[0, 10000]` (Property 5).
 *
 * Inputs outside the documented `1..10` band are clamped, not rejected, so
 * upstream Vision-Model misbehaviour cannot crash the pipeline (Requirement
 * 5.7 retries and Requirement 5.8 neutral fallback handle the soft-fail
 * paths).
 */
export function confidenceToStat(confidence: number): number {
  const c = clampConfidence(confidence);
  // Affine map: f(1) = 0, f(10) = 10000. Slope is 10000 / 9.
  const raw = ((c - 1) * MAX_STAT) / 9;
  return Math.round(raw);
}

/**
 * Compute the four Core Stats and the five Category Stats for a Scan.
 *
 * Pure: identical `ScoringInput` always produces identical `CoreStats` and
 * `CategoryStats` outputs. The Category Stats keys mirror `CATEGORY_STATS`
 * for the chosen Category.
 */
export function computeStats(i: ScoringInput): {
  core: CoreStats;
  category: CategoryStats;
} {
  const { core, category } = i.traitConfidences;

  const coreStats: CoreStats = {
    aura: confidenceToStat(core.aura),
    power: confidenceToStat(core.power),
    status: confidenceToStat(core.status),
    threat: confidenceToStat(core.threat),
  };

  const names = CATEGORY_STATS[i.category];
  const categoryStats: CategoryStats = {};
  for (const name of names) {
    const c = category[name];
    // If a stat key is missing entirely (programmer error upstream), default
    // to confidence 5 so the stat lands at the midpoint rather than at zero.
    // Vision-adapter validation should catch this before we ever get here.
    categoryStats[name] = confidenceToStat(c ?? 5);
  }

  return { core: coreStats, category: categoryStats };
}

/**
 * Compute the final Score from a `ScoringInput`.
 *
 * Deterministic. The same `ScoringInput` always yields the same integer in
 * `[1000, 100000]` (Properties 1 and 2). The score is a weighted sum of all
 * stats, mapped affine into the score band:
 *
 *   normalized = sum(weight_i * stat_i) / MAX_STAT  ∈ [0, 1]
 *   score      = round(MIN_SCORE + normalized * (MAX_SCORE - MIN_SCORE))
 *
 * The weighted sum's bounds are guaranteed by `Property 7: Score Weights
 * Normalize to 1`, so `normalized` always lands in `[0, 1]` and the affine
 * map always lands in `[MIN_SCORE, MAX_SCORE]` without an explicit clamp.
 * We still apply a defensive clamp as belt-and-suspenders.
 */
export function computeScore(i: ScoringInput): number {
  const stats = computeStats(i);

  let weighted = 0;
  weighted += CORE_WEIGHTS.aura * stats.core.aura;
  weighted += CORE_WEIGHTS.power * stats.core.power;
  weighted += CORE_WEIGHTS.status * stats.core.status;
  weighted += CORE_WEIGHTS.threat * stats.core.threat;

  const names = CATEGORY_STATS[i.category];
  for (const name of names) {
    weighted += CATEGORY_WEIGHT_EACH * (stats.category[name] ?? 0);
  }

  const normalized = weighted / MAX_STAT;
  const raw = MIN_SCORE + normalized * (MAX_SCORE - MIN_SCORE);
  const rounded = Math.round(raw);
  return clampScore(rounded);
}

/**
 * Map a Score to its Tier band (Requirement 6.2).
 *
 * Bands are the canonical inclusive ranges from the requirements:
 *
 *   D         1000 .. 4999
 *   C         5000 .. 14999
 *   B        15000 .. 34999
 *   A        35000 .. 54999
 *   S        55000 .. 74999
 *   SS       75000 .. 89999
 *   SSS      90000 .. 98999
 *   LIMITLESS 99000 .. 100000
 *
 * Validates Property 3 (monotonicity) and Property 4 (band membership).
 */
export function scoreToTier(score: number): Tier {
  const s = clampScore(Math.round(score));
  if (s <= 4999) return "D";
  if (s <= 14999) return "C";
  if (s <= 34999) return "B";
  if (s <= 54999) return "A";
  if (s <= 74999) return "S";
  if (s <= 89999) return "SS";
  if (s <= 98999) return "SSS";
  return "LIMITLESS";
}

/** Tier ranking used by Property 3 (monotonicity) and downstream UI sort. */
export const TIER_ORDER: ReadonlyArray<Tier> = [
  "D",
  "C",
  "B",
  "A",
  "S",
  "SS",
  "SSS",
  "LIMITLESS",
];

/** Numeric index of a Tier in ascending order. */
export function tierIndex(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * Sum of all stat weights (4 Core + 5 Category). Property 7 asserts this
 * normalizes to exactly 1.0 — it is exposed here so the test can recompute
 * it from the source instead of duplicating the formula.
 */
export const TOTAL_WEIGHT = (() => {
  let sum = 0;
  for (const w of Object.values(CORE_WEIGHTS)) sum += w;
  sum += CATEGORY_WEIGHT_TOTAL;
  return sum;
})();

/**
 * Convenience wrapper: compute everything a `scans` row needs in one call.
 * `anomaly.ts` consumes this output and applies any Score modifier.
 */
export function computeBaseScan(i: ScoringInput): {
  score: number;
  tier: Tier;
  core: CoreStats;
  category: CategoryStats;
} {
  const stats = computeStats(i);
  const score = computeScore(i);
  return {
    score,
    tier: scoreToTier(score),
    core: stats.core,
    category: stats.category,
  };
}

/**
 * Dummy use of `Category` and `TraitConfidences` so the file's type imports
 * are not erased. `Category` is the discriminator for `CATEGORY_STATS`; the
 * scoring core never narrows on it directly.
 */
export type _BoundCategory = Category;
export type _BoundTraitConfidences = TraitConfidences;

function clampConfidence(c: number): number {
  if (!Number.isFinite(c)) return 1;
  if (c < 1) return 1;
  if (c > 10) return 10;
  return c;
}

function clampScore(s: number): number {
  if (!Number.isFinite(s)) return MIN_SCORE;
  if (s < MIN_SCORE) return MIN_SCORE;
  if (s > MAX_SCORE) return MAX_SCORE;
  return s;
}

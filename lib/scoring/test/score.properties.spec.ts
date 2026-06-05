import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { CATEGORY_STATS } from "../src/category-stats.js";
import {
  CATEGORY_WEIGHT_TOTAL,
  CORE_WEIGHTS,
  MAX_SCORE,
  MIN_SCORE,
  computeScore,
} from "../src/score.js";
import type { Category, ScoringInput } from "../src/types.js";

/**
 * Property tests for the deterministic Score derivation.
 *
 * `computeScore` is the single point of authority over the persisted
 * `scans.score` column and the largest text element on the Share Card. It
 * must:
 *
 *   1. always land in the inclusive persisted band `[1000, 100000]`
 *      (Requirement 6.1, persisted as a CHECK constraint),
 *   2. be a pure function of `ScoringInput` so retries, recompute jobs, and
 *      the share-card renderer all agree on the same number (Requirement
 *      6.4), and
 *   3. be a sensible weighted average — i.e. the per-stat weights normalize
 *      to 1.0 — so the affine map onto `[1000, 100000]` cannot overshoot
 *      (formally Property 7, internal to the scoring formula).
 *
 * The three tests below cover those three contracts.
 */

/** All six Categories, in the order they are declared on the API surface. */
const CATEGORIES: readonly Category[] = [
  "SETUPS",
  "FITNESS",
  "DRIP",
  "PETS",
  "RIDES",
  "WILDCARD",
] as const;

/**
 * Smart generator: integer trait confidences in `[1, 10]`.
 *
 * The Vision Model schema (Requirement 5.2) constrains its emitted
 * confidences to integers in this band, and the deterministic neutral
 * fallback path (Requirement 5.8) emits values from the same band. Pinning
 * the generator there means the property test only spends shrink budget on
 * inputs the production pipeline can actually produce.
 */
const confidenceArb = fc.integer({ min: 1, max: 10 });

/**
 * Smart generator: a `ScoringInput` whose `traitConfidences.category` keys
 * exactly match the five stat names declared in `CATEGORY_STATS` for the
 * drawn Category. `computeScore` reads each category-stat by name, so a
 * generator that produced loose `Record<string, number>` shapes would mostly
 * exercise the `?? 5` fallback inside `computeStats` rather than the real
 * scoring path.
 */
const scoringInputArb: fc.Arbitrary<ScoringInput> = fc
  .constantFrom(...CATEGORIES)
  .chain((category) => {
    const names = CATEGORY_STATS[category];
    const categoryRecordArb = fc
      .tuple(
        confidenceArb,
        confidenceArb,
        confidenceArb,
        confidenceArb,
        confidenceArb,
      )
      .map(([a, b, c, d, e]) => ({
        [names[0]]: a,
        [names[1]]: b,
        [names[2]]: c,
        [names[3]]: d,
        [names[4]]: e,
      }));

    return fc.record({
      category: fc.constant(category),
      traitConfidences: fc.record({
        core: fc.record({
          aura: confidenceArb,
          power: confidenceArb,
          status: confidenceArb,
          threat: confidenceArb,
        }),
        category: categoryRecordArb,
      }),
    });
  });

describe("score derivation properties", () => {
  /**
   * **Property 1: Score Range**
   *
   * ∀ valid `ScoringInput`, `computeScore(i) ∈ [1000, 100000]` and is an
   * integer.
   *
   * The persisted `scans.score` column is `integer NOT NULL` with the CHECK
   * constraint `score BETWEEN 1000 AND 100000`. If `computeScore` ever
   * emitted a value outside that band the row insert would be rejected at
   * the database level and the entire scan pipeline would fail after the
   * Vision Model call — wasted work on a failed reveal. The clean-integer
   * assertion is required because the column type is `integer`, not
   * `numeric`.
   *
   * Validates: Requirements 6.1
   */
  test("Property 1: computeScore output is an integer in [MIN_SCORE, MAX_SCORE]", () => {
    fc.assert(
      fc.property(scoringInputArb, (input) => {
        const score = computeScore(input);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(MIN_SCORE);
        expect(score).toBeLessThanOrEqual(MAX_SCORE);
      }),
    );
  });

  /**
   * **Property 2: Score Determinism**
   *
   * ∀ inputs `i`, `computeScore(i) === computeScore(i)` across calls.
   *
   * `computeScore` is contracted as a pure function so that the share-card
   * renderer, the API server, and any backfill or recompute job always
   * agree on the persisted Score for a given `(category, traitConfidences)`
   * pair. A regression here would manifest as a Share Card whose Score does
   * not match the Result Screen's, breaking the verification-QR contract
   * (Requirements 8.3, 8.4).
   *
   * Validates: Requirements 6.4
   */
  test("Property 2: computeScore is deterministic across repeated calls", () => {
    fc.assert(
      fc.property(scoringInputArb, (input) => {
        const a = computeScore(input);
        const b = computeScore(input);
        expect(b).toBe(a);
      }),
    );
  });

  /**
   * **Property 7: Score Weights Normalize to 1**
   *
   * `sum(CORE_WEIGHTS) + CATEGORY_WEIGHT_TOTAL === 1`.
   *
   * `computeScore` builds a weighted sum across the four Core Stats and the
   * five Category Stats and then normalizes by `MAX_STAT` to produce a value
   * in `[0, 1]` before the affine map onto `[MIN_SCORE, MAX_SCORE]`. That
   * argument only holds when the stat weights together sum to exactly 1.0 —
   * if they summed to less, the maximum reachable score would fall short of
   * `MAX_SCORE`; if more, the result could overshoot the band and rely on
   * the defensive clamp in `computeScore`, hiding tuning regressions.
   *
   * `toBeCloseTo` rather than `toBe` because the canonical weights
   * `0.18, 0.14, 0.10, 0.13, 0.45` are not exactly representable in IEEE-754
   * double-precision; their sum lands within a few ULPs of `1.0`. A 12-digit
   * tolerance is well below any realistic tuning change while still catching
   * any meaningful regression.
   *
   * Internal invariant of the scoring formula.
   */
  test("Property 7: CORE_WEIGHTS plus CATEGORY_WEIGHT_TOTAL sum to 1.0", () => {
    let coreSum = 0;
    for (const w of Object.values(CORE_WEIGHTS)) coreSum += w;
    expect(coreSum + CATEGORY_WEIGHT_TOTAL).toBeCloseTo(1, 12);
  });
});

import fc from "fast-check";
import { describe, expect, test } from "vitest";

import {
  MAX_SCORE,
  MIN_SCORE,
  TIER_ORDER,
  scoreToTier,
  tierIndex,
} from "../src/score.js";
import type { Tier } from "../src/types.js";

/**
 * The canonical Tier bands from Requirement 6.2. These are the **documented**
 * bands the scoring contract promises — the test redeclares them here from
 * the requirement text rather than importing implementation internals so a
 * regression in `scoreToTier` cannot silently rewrite the spec from inside
 * the test file.
 *
 * Each entry is `[tier, minInclusive, maxInclusive]`.
 */
const TIER_BANDS: ReadonlyArray<readonly [Tier, number, number]> = [
  ["D", 1000, 4999],
  ["C", 5000, 14999],
  ["B", 15000, 34999],
  ["A", 35000, 54999],
  ["S", 55000, 74999],
  ["SS", 75000, 89999],
  ["SSS", 90000, 98999],
  ["LIMITLESS", 99000, 100000],
] as const;

/**
 * Arbitrary integer score in the canonical persisted range `[MIN_SCORE,
 * MAX_SCORE]`. Pinned to integers because the persisted column is `integer`
 * and `scoreToTier` is only contracted over integer inputs (Requirement 6.1).
 */
const scoreArb = fc.integer({ min: MIN_SCORE, max: MAX_SCORE });

/**
 * Smart generator producing two scores already in non-decreasing order so
 * the monotonicity property does not waste runs on `s1 > s2` inputs that
 * carry no information.
 */
const orderedScorePair = fc
  .tuple(scoreArb, scoreArb)
  .map<[number, number]>(([a, b]) => (a <= b ? [a, b] : [b, a]));

/**
 * Smart generator producing `(tier, score)` where `score` is uniformly
 * distributed inside the documented band for `tier`. Generates over the
 * union of all eight bands so every band gets exercised.
 */
const tierBandScore = fc
  .constantFrom(...TIER_BANDS)
  .chain(([tier, lo, hi]) =>
    fc.integer({ min: lo, max: hi }).map((s) => ({ tier, score: s })),
  );

describe("tier mapping properties", () => {
  /**
   * Sanity check: every entry in `TIER_ORDER` has a known band and every
   * documented band names a tier in `TIER_ORDER`. If this drifts the rest of
   * the property tests below would be vacuous.
   */
  test("TIER_BANDS covers every member of TIER_ORDER exactly once", () => {
    expect(TIER_BANDS.map(([t]) => t)).toEqual([...TIER_ORDER]);
  });

  /**
   * Sanity check: the documented bands tile the persisted score range
   * `[MIN_SCORE, MAX_SCORE]` contiguously without gaps or overlaps. If any
   * band were misstated, Property 4 below could pass for the wrong reason.
   */
  test("TIER_BANDS tile [MIN_SCORE, MAX_SCORE] without gaps", () => {
    expect(TIER_BANDS[0]?.[1]).toBe(MIN_SCORE);
    expect(TIER_BANDS[TIER_BANDS.length - 1]?.[2]).toBe(MAX_SCORE);
    for (let i = 1; i < TIER_BANDS.length; i++) {
      const prevHi = TIER_BANDS[i - 1]![2];
      const currLo = TIER_BANDS[i]![1];
      expect(currLo).toBe(prevHi + 1);
    }
  });

  /**
   * **Property 3: Tier Monotonicity**
   *
   * For all integer scores `s1 ≤ s2` in `[MIN_SCORE, MAX_SCORE]`,
   * `tierIndex(scoreToTier(s1)) ≤ tierIndex(scoreToTier(s2))`.
   *
   * Tier rank must never decrease as score increases — Leaderboards rank by
   * Score and then label by Tier; if a higher-scoring scan could end up in a
   * lower tier the badge displayed on the Result Screen and the Share Card
   * would contradict the leaderboard ordering.
   *
   * Validates: Requirements 6.2
   */
  test("Property 3: scoreToTier is monotonic in score", () => {
    fc.assert(
      fc.property(orderedScorePair, ([s1, s2]) => {
        const t1 = tierIndex(scoreToTier(s1));
        const t2 = tierIndex(scoreToTier(s2));
        expect(t1).toBeLessThanOrEqual(t2);
      }),
    );
  });

  /**
   * **Property 4: Tier Band**
   *
   * For every tier `T` and every integer `s` in `T`'s documented inclusive
   * band, `scoreToTier(s) === T`. Pulled directly from Requirement 6.2 — the
   * persisted CHECK constraint `tier = derive_tier(score)` enforces this on
   * the database side, so a runtime drift between `scoreToTier` and the
   * documented bands would surface as a failing insert rather than a wrong
   * label on the card.
   *
   * Validates: Requirements 6.2
   */
  test("Property 4: scoreToTier(s) === T for every s inside T's band", () => {
    fc.assert(
      fc.property(tierBandScore, ({ tier, score }) => {
        expect(scoreToTier(score)).toBe(tier);
      }),
    );
  });

  /**
   * Smoke cases at every band boundary. Property tests cover the interior;
   * these example tests anchor the inclusive endpoints of each band so an
   * off-by-one regression in `scoreToTier` is caught even if fast-check
   * happens not to sample the exact boundary on a given run.
   */
  test.each(TIER_BANDS.flatMap(([tier, lo, hi]) => [
    [tier, lo],
    [tier, hi],
  ]))("scoreToTier(%s boundary %d) === %s", (tier, score) => {
    expect(scoreToTier(score)).toBe(tier);
  });
});

import fc from "fast-check";
import { describe, expect, test } from "vitest";

import {
  MAX_STAT,
  MIN_STAT,
  confidenceToStat,
} from "../src/score.js";

/**
 * Property tests for the trait-confidence → stat mapping.
 *
 * `confidenceToStat` is the deterministic affine map that converts a Vision
 * Model trait confidence (an integer in `[1, 10]`) into a persisted stat
 * value (an integer in `[MIN_STAT, MAX_STAT] = [0, 10000]`). It anchors the
 * Core Stats and Category Stats on every Scan, so the two invariants below
 * are pre-conditions for Requirement 6.3 (stat range) and Requirement 6.4
 * (deterministic, monotone derivation).
 */

/**
 * Smart generator: integer trait confidences in the documented domain
 * `[1, 10]`. The Vision Model schema constrains its output to this range
 * (Requirement 5.2), and the neutral fallback path (Requirement 5.8) also
 * emits integers in this band; restricting the generator to integers keeps
 * the property focused on the contract `confidenceToStat` actually has to
 * uphold for the production pipeline.
 */
const confidenceArb = fc.integer({ min: 1, max: 10 });

describe("stat mapping properties", () => {
  /**
   * **Property 5: Stat Range**
   *
   * ∀ confidence `c ∈ [1, 10]`, `confidenceToStat(c) ∈ [0, 10000]` and
   * integer.
   *
   * The mapping is the affine transform pinning `1 → 0` and `10 → 10000`.
   * The persisted `core_stats` and `category_stats` columns and the
   * Result Screen / Share Card renderers all assume the value is a clean
   * integer inside this inclusive band, so a regression here would either
   * crash the renderer or violate the database contract.
   *
   * Validates: Requirements 6.3
   */
  test("Property 5: confidenceToStat output is an integer in [0, 10000]", () => {
    fc.assert(
      fc.property(confidenceArb, (c) => {
        const stat = confidenceToStat(c);
        expect(Number.isInteger(stat)).toBe(true);
        expect(stat).toBeGreaterThanOrEqual(MIN_STAT);
        expect(stat).toBeLessThanOrEqual(MAX_STAT);
      }),
    );
  });

  /**
   * **Property 6: Stat Monotonicity**
   *
   * ∀ `c1 ≤ c2`, `confidenceToStat(c1) ≤ confidenceToStat(c2)`.
   *
   * Higher Vision-Model confidence must never produce a smaller stat;
   * otherwise the four Core Stats and the five Category Stats would invert
   * the model's signal, and the downstream weighted score would no longer
   * be a monotone function of the model's confidences.
   *
   * Validates: Requirements 6.3
   */
  test("Property 6: confidenceToStat is non-decreasing in confidence", () => {
    fc.assert(
      fc.property(confidenceArb, confidenceArb, (a, b) => {
        const [c1, c2] = a <= b ? [a, b] : [b, a];
        expect(confidenceToStat(c1)).toBeLessThanOrEqual(
          confidenceToStat(c2),
        );
      }),
    );
  });
});

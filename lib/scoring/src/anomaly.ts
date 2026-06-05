/**
 * Anomaly engine — pure, deterministic.
 *
 * The Scanner pipeline calls these three functions, in order, after the
 * base score has been computed:
 *
 *   1. `deriveAnomalySeed({ scanId, category, imagePerceptualHash })` —
 *      collapses the per-Scan identifiers into a 32-bit seed. Same scan id +
 *      category + image hash always yields the same seed.
 *   2. `drawAnomaly(seed)` — draws an `AnomalyType` (or `null`) from the
 *      `ANOMALY_WEIGHTS` cumulative distribution using the `mulberry32`
 *      PRNG seeded by the `seed` argument.
 *   3. `applyAnomalyModifier(score, anomaly, seed)` — reseeds the PRNG
 *      (with `seed ^ 0x9E3779B9` so the modifier draw is independent of
 *      the type draw) and applies the per-anomaly Score modifier band
 *      from Requirements 7.4 / 7.5 / 7.6 / 7.7 / 7.8. The returned
 *      `finalScore` is clamped to `[MIN_SCORE, MAX_SCORE]` per
 *      Requirement 7.9, and `modifierPct` is rounded to two decimals so
 *      it fits the `numeric(4,2)` audit column on `scans`.
 *
 * The functions are pure — no I/O, no global state, no `Math.random`. The
 * RNG is exclusively `mulberry32` from `./prng.js`. Every random decision
 * is driven by `seed`, which is itself derived from the Scan identity, so
 * replaying the pipeline against the same Scan yields the same Anomaly.
 *
 * Design references:
 *   - Requirement 7.1 — five Anomaly types
 *   - Requirement 7.2 — 6–8% trigger rate; visual-only weight > modifier weight
 *   - Requirement 7.3 — at most one Anomaly per Scan
 *   - Requirements 7.4–7.8 — per-Anomaly modifier bands
 *   - Requirement 7.9 — clamp the modified Score to `[1000, 100000]`
 *   - design.md "Anomaly Engine" section — concrete weight table + draw algorithm
 */

import { createHash } from "node:crypto";

import { mulberry32 } from "./prng.js";
import { MAX_SCORE, MIN_SCORE } from "./score.js";
import type { AnomalyType, Category } from "./types.js";

/**
 * Cumulative weight table for the random Anomaly draw.
 *
 * Sums to `0.0700` so `7%` of Scans receive an Anomaly — the midpoint of
 * the 6–8% band in Requirement 7.2. Visual-only types (`SCOUTER_FAILURE`,
 * `UNREGISTERED_ENERGY`) sum to `0.0500`, score-modifier types
 * (`POWER_SURGE_DETECTED`, `FORBIDDEN_AURA`, `CHAOS_SPIKE`) sum to `0.0200`,
 * so the visual-only majority required by Requirement 7.2 holds.
 *
 * The remaining `0.9300` of probability is "no anomaly" and `drawAnomaly`
 * returns `null` for that interval.
 *
 * Iteration order matters: `drawAnomaly` walks the entries in declaration
 * order and assigns the first cumulative bucket that contains the random
 * draw. The order here matches the canonical `design.md` table; do not
 * reorder without updating the design and the distribution simulation
 * test.
 */
export const ANOMALY_WEIGHTS = {
  // Visual-only — no Score modifier. Sum 0.0500.
  SCOUTER_FAILURE: 0.027,
  UNREGISTERED_ENERGY: 0.023,
  // Score modifiers. Sum 0.0200.
  POWER_SURGE_DETECTED: 0.0085,
  FORBIDDEN_AURA: 0.007,
  CHAOS_SPIKE: 0.0045,
} as const satisfies Record<AnomalyType, number>;

/**
 * Total Anomaly probability. Exposed for the distribution simulation
 * (Property 12) so the test recomputes the target from the source rather
 * than duplicating the constant.
 */
export const ANOMALY_TOTAL_WEIGHT: number = (() => {
  let sum = 0;
  for (const w of Object.values(ANOMALY_WEIGHTS)) sum += w;
  return sum;
})();

/**
 * Sub-totals used by Property 13 (visual-only weight > modifier weight).
 * Re-exporting the partition makes the invariant auditable from a single
 * import site.
 */
export const ANOMALY_VISUAL_ONLY: ReadonlyArray<AnomalyType> = [
  "SCOUTER_FAILURE",
  "UNREGISTERED_ENERGY",
];
export const ANOMALY_SCORE_MODIFIERS: ReadonlyArray<AnomalyType> = [
  "POWER_SURGE_DETECTED",
  "FORBIDDEN_AURA",
  "CHAOS_SPIKE",
];

/**
 * Modifier band per Anomaly type. The numbers are inclusive percent values.
 * `null` means the band is fixed at `0` and the Anomaly never modifies the
 * Score (Requirements 7.6, 7.7).
 *
 * Bands match the design table:
 *   POWER_SURGE_DETECTED  +5 .. +10
 *   FORBIDDEN_AURA        -10 .. -5
 *   SCOUTER_FAILURE       0
 *   UNREGISTERED_ENERGY   0
 *   CHAOS_SPIKE           -15 .. +15
 */
export const ANOMALY_MODIFIER_BANDS = {
  POWER_SURGE_DETECTED: { min: 5, max: 10 },
  FORBIDDEN_AURA: { min: -10, max: -5 },
  SCOUTER_FAILURE: null,
  UNREGISTERED_ENERGY: null,
  CHAOS_SPIKE: { min: -15, max: 15 },
} as const satisfies Record<AnomalyType, { min: number; max: number } | null>;

/**
 * Bit-mixing constant used to decorrelate the modifier-percent draw from
 * the type draw. Same constant the design specifies (`0x9E3779B9`, the
 * 32-bit fractional part of the golden ratio used as a generic PRNG salt).
 */
const MODIFIER_SEED_SALT = 0x9e3779b9;

/**
 * Inputs to `deriveAnomalySeed`. Kept as a single object for forward
 * compatibility with the design's `deriveAnomalySeed({ scanId, category,
 * imagePerceptualHash })` signature.
 */
export interface AnomalySeedInput {
  scanId: string;
  category: Category;
  imagePerceptualHash: string;
}

/**
 * Result returned by `applyAnomalyModifier`.
 *
 * `finalScore` is the persisted Score (clamped to `[MIN_SCORE, MAX_SCORE]`)
 * and `modifierPct` is the audit value persisted to `scans.anomaly_modifier_pct`
 * — rounded to two decimals to fit the `numeric(4,2)` column.
 */
export interface AnomalyApplication {
  finalScore: number;
  modifierPct: number;
}

/**
 * Collapse the per-Scan identifiers into a deterministic 32-bit seed.
 *
 * Implementation matches `design.md`: SHA-256 over the pipe-delimited
 * tuple, then take the first 8 hex characters as a big-endian unsigned
 * 32-bit integer. The first 8 hex characters are 32 bits of entropy from a
 * SHA-256 digest, which is sufficient to seed `mulberry32`.
 */
export function deriveAnomalySeed(input: AnomalySeedInput): number {
  const payload = `${input.scanId}|${input.category}|${input.imagePerceptualHash}`;
  const digest = createHash("sha256").update(payload).digest("hex");
  // `parseInt` of an 8-hex string yields `0..0xFFFFFFFF` which fits a 32-bit
  // unsigned integer. The `>>> 0` coerces it to that representation and
  // guards against any future widening from `Number.parseInt`.
  return Number.parseInt(digest.slice(0, 8), 16) >>> 0;
}

/**
 * Draw an `AnomalyType` from the `ANOMALY_WEIGHTS` cumulative distribution,
 * or `null` for "no anomaly". Deterministic in `seed`.
 */
export function drawAnomaly(seed: number): AnomalyType | null {
  const r = mulberry32(seed)();
  let cumulative = 0;
  for (const [type, weight] of Object.entries(ANOMALY_WEIGHTS) as Array<
    [AnomalyType, number]
  >) {
    cumulative += weight;
    if (r < cumulative) return type;
  }
  return null;
}

/**
 * Apply the Anomaly's Score modifier (or no modifier, for visual-only
 * Anomalies and the `null` case) and clamp the result to `[MIN_SCORE,
 * MAX_SCORE]` per Requirement 7.9.
 *
 * The modifier-percent draw uses a *different* seed (`seed ^
 * MODIFIER_SEED_SALT`) than the type draw so the modifier amount is
 * statistically independent of the type, while still being deterministic
 * in the original Scan seed.
 *
 * Validates Property 9 (modifier band per type), Property 10 (visual-only
 * Anomalies have `modifierPct === 0`), and Property 11 (clamp).
 */
export function applyAnomalyModifier(
  score: number,
  anomaly: AnomalyType | null,
  seed: number,
): AnomalyApplication {
  if (anomaly === null) {
    return {
      finalScore: clampScore(Math.round(score)),
      modifierPct: 0,
    };
  }

  const band = ANOMALY_MODIFIER_BANDS[anomaly];
  let pct = 0;
  if (band !== null) {
    const rng = mulberry32((seed ^ MODIFIER_SEED_SALT) >>> 0);
    // Affine map `[0, 1) → [min, max)`. The boundaries land in the
    // documented inclusive band on integer percent values; `mulberry32`
    // never returns exactly 1.0 so the upper bound is never quite reached
    // — but `Number(pct.toFixed(2))` plus the band check in Property 9
    // tolerates the open upper bound.
    pct = band.min + rng() * (band.max - band.min);
  }

  const modified = Math.round(score * (1 + pct / 100));
  const finalScore = clampScore(modified);

  return {
    finalScore,
    // `numeric(4,2)` audit column wants two-decimal precision.
    modifierPct: Number(pct.toFixed(2)),
  };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return MIN_SCORE;
  if (value < MIN_SCORE) return MIN_SCORE;
  if (value > MAX_SCORE) return MAX_SCORE;
  return value;
}

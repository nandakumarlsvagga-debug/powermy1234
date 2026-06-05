/**
 * Property tests for the Fallback Commentary Library (`pickFallback`).
 *
 * Task 8.5 — covers a single, named property:
 *
 *   **Property 18: Fallback Never Slop**
 *
 *     For arbitrary `(category, tier, imageNouns, seed)` inputs, the
 *     line returned by `pickFallback(category, tier, imageNouns, seed)`
 *     MUST pass `detectSlop(line, [chosenNoun])`. That is, no
 *     fallback line — across every category, every tier, every noun
 *     bundle, and every seed — can ever be slop.
 *
 *     Validates: Requirements 5.6
 *
 * Why this matters
 *
 * The fallback library is the deterministic backstop the orchestrator
 * (task 8.7) reaches for whenever the Vision Model output cannot be
 * used: slop rejection (Requirement 5.5/5.6), retry failure
 * (Requirement 5.7/5.8), or concurrency-cap exhaustion. If a
 * fallback line could itself be slop, the orchestrator would have
 * nowhere to go and the persisted commentary would silently violate
 * the brand-tone contract that the Slop Detector is there to enforce.
 *
 * The build-time check inside `fallback-library.ts` already verifies
 * every template against `detectSlop` once per category with a
 * representative noun. This property test generalises that check to
 * the surface `pickFallback` actually exposes at runtime: any
 * `(category, tier, imageNouns, seed)` the orchestrator might pass.
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";

import {
  FALLBACK_TEMPLATES,
  pickFallback,
} from "../src/fallback-library.js";
import { detectSlop } from "../src/slop-detector.js";
import type { Category, Tier } from "../src/types.js";

/* -------------------------------------------------------------------- */
/*  Generators                                                          */
/* -------------------------------------------------------------------- */

/**
 * The six user-selectable Categories — the only values the
 * orchestrator ever passes for `category`. Mirrors `Category` in
 * `../src/types.ts`. Re-declared as a const tuple here so the
 * generator does not silently drift if a category is added.
 */
const ALL_CATEGORIES: readonly Category[] = [
  "SETUPS",
  "FITNESS",
  "DRIP",
  "PETS",
  "RIDES",
  "WILDCARD",
] as const;

/**
 * The eight tier badges — the only values the orchestrator ever
 * passes for `tier`. Mirrors `Tier` in `../src/types.ts`.
 */
const ALL_TIERS: readonly Tier[] = [
  "D",
  "C",
  "B",
  "A",
  "S",
  "SS",
  "SSS",
  "LIMITLESS",
] as const;

const categoryArb = fc.constantFrom(...ALL_CATEGORIES);
const tierArb = fc.constantFrom(...ALL_TIERS);

/**
 * Smart noun generator.
 *
 * The Vision Model emits 1–6 image nouns alongside its commentary.
 * Real outputs are short concrete nouns ("rig", "bike", "patio
 * table") and occasional 2-word phrases ("gaming chair"). Live
 * outputs occasionally also include junk (longer phrases, stray
 * punctuation, leading whitespace) that `pickFallback` filters out
 * via `pickNoun`.
 *
 * Coverage strategy:
 *   1. A bank of realistic short nouns weighted heavily so the
 *      common case dominates the search.
 *   2. An adversarial branch producing whitespace-only, empty, or
 *      3+ token strings to exercise the `pickNoun` filter and force
 *      the default-noun fallback path.
 *   3. An "anything" branch via `fc.string()` so fast-check can find
 *      pathological inputs the bank misses.
 *
 * Length is bounded at 6 — the upper limit of nouns the structured
 * Bedrock response is permitted to emit per design.md.
 */
const COMMON_NOUNS = [
  "rig",
  "setup",
  "desk",
  "monitor",
  "keyboard",
  "physique",
  "frame",
  "shoulders",
  "outfit",
  "fit",
  "jacket",
  "shoes",
  "creature",
  "cat",
  "dog",
  "lizard",
  "machine",
  "engine",
  "bike",
  "wheels",
  "subject",
  "shape",
  "thing",
  "form",
  "gaming chair",
  "patio table",
  "down jacket",
  "track bike",
] as const;

const realisticNounArb = fc.constantFrom(...COMMON_NOUNS);

const adversarialNounArb = fc.oneof(
  // Empty / whitespace-only — `pickNoun` must filter these.
  fc.constantFrom("", " ", "   ", "\t\n"),
  // 3+ tokens — `pickNoun` must filter these so commentary stays in band.
  fc.constantFrom(
    "very large gaming chair",
    "bright sunlit patio table",
    "absolutely tremendous racing bicycle",
  ),
  // Punctuated nouns — exercise the regex-escape path in detectSlop.
  fc.constantFrom("u.s. flag", "rig.", "(jacket)"),
);

const nounArb = fc.oneof(
  { weight: 6, arbitrary: realisticNounArb },
  { weight: 2, arbitrary: adversarialNounArb },
  // Fully arbitrary string — clipped so a single noun cannot dominate
  // the input bundle. fast-check will shrink to the minimum failing
  // case, so a wide search here is cheap.
  { weight: 1, arbitrary: fc.string({ maxLength: 24 }) },
);

const imageNounsArb = fc.array(nounArb, { minLength: 0, maxLength: 6 });

/**
 * 32-bit unsigned seed for `mulberry32`. The PRNG masks to `>>> 0`
 * internally so any 32-bit integer is a valid seed; we generate the
 * full unsigned range so adjacent seeds (which can map to identical
 * draws in 32-bit PRNGs) are exercised alongside far-apart ones.
 */
const seedArb = fc.integer({ min: 0, max: 0xffffffff });

/* -------------------------------------------------------------------- */
/*  Helpers                                                             */
/* -------------------------------------------------------------------- */

/**
 * Recover the noun `pickFallback` substituted into the chosen
 * template. The slop detector's `no_image_noun` rule requires at
 * least one noun from a supplied list to appear as a whole word in
 * the commentary; for this test we pass exactly the noun that was
 * substituted, so this rule is automatically satisfied iff
 * `pickFallback` faithfully filled its `{noun}` slot.
 *
 * We can recover the substituted noun without re-running
 * `pickFallback` because the templates are public: we look up the
 * eligible templates for `(category, tier)`, find the one whose
 * skeleton matches the produced commentary modulo the slot, and
 * extract the noun from the slot position.
 *
 * If no template matches (which would be a `pickFallback` bug), this
 * helper returns `null` and the assertion downstream fails with a
 * message that makes the bug obvious.
 */
function recoverSubstitutedNoun(
  category: Category,
  tier: Tier,
  produced: string,
): string | null {
  const TIER_ORDER: readonly Tier[] = ALL_TIERS;
  const tierIdx = TIER_ORDER.indexOf(tier);

  const eligible = FALLBACK_TEMPLATES[category].filter(
    (t) =>
      TIER_ORDER.indexOf(t.minTier) <= tierIdx &&
      tierIdx <= TIER_ORDER.indexOf(t.maxTier),
  );

  for (const tpl of eligible) {
    const [head, tail] = tpl.text.split("{noun}");
    if (head === undefined || tail === undefined) continue;
    if (produced.startsWith(head) && produced.endsWith(tail)) {
      return produced.slice(head.length, produced.length - tail.length);
    }
  }
  return null;
}

/* -------------------------------------------------------------------- */
/*  Property tests                                                      */
/* -------------------------------------------------------------------- */

describe("fallback library properties", () => {
  /**
   * **Property 18: Fallback Never Slop**
   *
   * For arbitrary `(category, tier, imageNouns, seed)`, the line
   * returned by `pickFallback` MUST pass `detectSlop` against the
   * substituted noun.
   *
   * The slop detector's three rules are:
   *
   *   1. Word count ∈ [8, 14] — every template is hand-counted with
   *      a 1–2 token noun substitution; `pickFallback`'s `pickNoun`
   *      drops 3+ token entries so a long phrase from `imageNouns`
   *      cannot push the line out of band, and falls back to the
   *      category's representative noun (also short) when no
   *      eligible noun is supplied. This property exercises both
   *      paths.
   *
   *   2. No banned word — every template is statically free of
   *      `BANNED_WORDS` (verified at module load by
   *      `assertNoTemplateProducesSlop`). The substituted noun comes
   *      either from the supplied bundle or from the representative
   *      list; even pathological adversarial nouns from
   *      `adversarialNounArb` cannot introduce a banned word because
   *      `pickNoun` filters them out and the default noun is
   *      hand-curated.
   *
   *   3. At least one image noun appears as a whole word — we pass
   *      the recovered substituted noun as `[chosenNoun]` to
   *      `detectSlop`, so this rule is satisfied whenever
   *      `pickFallback` correctly substituted the slot.
   *
   * Validates: Requirements 5.6
   */
  test("Property 18: pickFallback output is never slop", () => {
    fc.assert(
      fc.property(
        categoryArb,
        tierArb,
        imageNounsArb,
        seedArb,
        (category, tier, imageNouns, seed) => {
          const commentary = pickFallback(category, tier, imageNouns, seed);

          // The chosen noun must be recoverable; failing to recover
          // means `pickFallback` returned a string outside the
          // template set, which is itself a regression.
          const chosenNoun = recoverSubstitutedNoun(
            category,
            tier,
            commentary,
          );
          expect(
            chosenNoun,
            `pickFallback produced a string that does not match any ` +
              `template for ${category}/${tier}: ${JSON.stringify(commentary)}`,
          ).not.toBeNull();

          const verdict = detectSlop(commentary, [chosenNoun!]);
          expect(
            verdict,
            `Slop verdict for ${category}/${tier} commentary ` +
              `${JSON.stringify(commentary)} (noun=${JSON.stringify(chosenNoun)}, ` +
              `seed=${seed}, imageNouns=${JSON.stringify(imageNouns)})`,
          ).toEqual({ ok: true });
        },
      ),
      // Larger run count than the fast-check default (100) because the
      // search space has four dimensions and the failure mode we care
      // about (a pathological noun pushing the line out of band) is
      // sparse. 1000 runs takes well under a second on `pickFallback`,
      // which is a pure function over a small template set.
      { numRuns: 1000 },
    );
  });
});

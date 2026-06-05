/**
 * Fallback Commentary Library for the Vision Adapter.
 *
 * This is the deterministic backstop the orchestrator (task 8.7) reaches
 * for whenever the Vision Model commentary cannot be used: the slop
 * detector rejected the line, the model errored after retry, the
 * concurrency cap was exhausted, or the orchestrator forced
 * `SCOUTER_FAILURE` for any other reason.
 *
 * Design references:
 *   - Requirement 5.6 — "the line is drawn from the Fallback Commentary
 *     Library matching the selected Category and the computed Tier,
 *     with image-derived nouns slotted in where the template requires
 *     them, and persisted as the final commentary for the Scan."
 *   - design.md → "Stage 8 — Slop Detector" and "Stage 10 — Neutral
 *     fallback".
 *   - tasks.md → 8.4 acceptance criteria: ≥ 24 templates per category
 *     (≥ 144 total), one `{noun}` slot each, `[minTier, maxTier]` band,
 *     all eight tiers covered per category, deterministic selection
 *     via `mulberry32`, build-time slop check.
 *
 * Brand-tone constraint: every template, after `{noun}` substitution
 * with the chosen image-derived noun, MUST satisfy the slop detector:
 *   - word count ∈ [8, 14]
 *   - no banned word from `BANNED_WORDS` (whole-word, case-insensitive)
 *   - the substituted noun appears as a whole word (this is automatic
 *     because the noun is the substitution).
 *
 * The build-time check at the bottom of this file runs every template
 * through `detectSlop` with the category's representative noun and
 * throws on any failure, so the import itself is the regression guard.
 * Property 18 ("Fallback Never Slop") in task 8.5 re-validates this
 * invariant under arbitrary `(category, tier, nouns, seed)` inputs.
 */

import { detectSlop } from "./slop-detector.js";
import type { Category, Tier } from "./types.js";

/* -------------------------------------------------------------------- */
/*  Tier ordering                                                       */
/* -------------------------------------------------------------------- */

/**
 * Tier ranking used to test whether a tier sits inside a template's
 * `[minTier, maxTier]` band. Mirrors `TIER_ORDER` in
 * `@workspace/scoring/src/score.ts`. Re-declared locally for the same
 * reason `Category` and `Tier` are re-declared in `./types.ts`: this
 * package keeps a stable surface independent of scoring's exports.
 */
const TIER_ORDER: ReadonlyArray<Tier> = [
  "D",
  "C",
  "B",
  "A",
  "S",
  "SS",
  "SSS",
  "LIMITLESS",
];

function tierIndex(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

/* -------------------------------------------------------------------- */
/*  Vendored deterministic PRNG                                         */
/* -------------------------------------------------------------------- */

/**
 * Vendored copy of `mulberry32` from
 * `lib/scoring/src/prng.ts`. We re-vendor (rather than depend on
 * `@workspace/scoring`) so the vision package stays self-contained
 * during the bottom-up build order, matching the convention used in
 * `./slop-detector.ts` and `./types.ts`. The implementation is the
 * public-domain reference from Tommy Ettinger; given the same seed it
 * emits the same sequence of `[0, 1)` floats, which is the
 * determinism boundary `pickFallback` relies on.
 */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------- */
/*  Template shape                                                      */
/* -------------------------------------------------------------------- */

/**
 * A single fallback commentary template.
 *
 * `text` MUST contain the literal substring `"{noun}"` exactly once.
 * `pickFallback` performs a single replacement; downstream code should
 * not rely on multi-slot expansion.
 *
 * `minTier` and `maxTier` define the inclusive `[minTier, maxTier]`
 * band the template is eligible for. A template targeted at a single
 * tier sets `minTier === maxTier`.
 */
export interface FallbackTemplate {
  readonly text: string;
  readonly minTier: Tier;
  readonly maxTier: Tier;
}

/**
 * Representative single-word nouns used by the build-time slop check.
 *
 * The image nouns the Vision Model emits are arbitrary at runtime
 * (e.g. "rig", "gaming chair", "sunlit patio table"). The build-time
 * check picks one canonical short noun per category so the slop
 * detector evaluates each template against a realistic substitution.
 * `pickFallback` itself prefers short nouns from the supplied
 * `imageNouns` so commentary stays inside the 8–14 word band.
 */
const REPRESENTATIVE_NOUN: Readonly<Record<Category, string>> = {
  SETUPS: "rig",
  FITNESS: "physique",
  DRIP: "outfit",
  PETS: "creature",
  RIDES: "machine",
  WILDCARD: "subject",
};

/**
 * Default fallback noun used when `imageNouns` is empty or contains
 * only entries longer than two whitespace-separated tokens (which
 * could push commentary out of the 8–14 word band). Matches the
 * representative nouns above.
 */
function defaultNounFor(category: Category): string {
  return REPRESENTATIVE_NOUN[category];
}

/* -------------------------------------------------------------------- */
/*  Templates                                                           */
/* -------------------------------------------------------------------- */

/**
 * Per-category fallback templates.
 *
 * Each list contains 24 entries spanning all eight tiers (3 per tier
 * by default). The tone progression by tier:
 *
 *   D         dismissive, thin, undersignal
 *   C         basic, foundations forming, rookie
 *   B         recognized, holding ground
 *   A         heavy, dangerous, multi-league
 *   S         dominant, sovereign, intimidating
 *   SS        legendary, charts the apex
 *   SSS       mythic, near-uncontainable
 *   LIMITLESS off-the-scale, instrumentation-breaking
 *
 * Each template is hand-counted to land inside the slop detector's
 * 8–14 word band when `{noun}` is replaced with a 1–2 word noun, and
 * is free of any entry from `BANNED_WORDS`. The build-time check at
 * the bottom of this file re-verifies both conditions on import.
 */
export const FALLBACK_TEMPLATES: Readonly<
  Record<Category, ReadonlyArray<FallbackTemplate>>
> = {
  SETUPS: [
    // D
    { text: "This {noun} barely registers a signal worth my attention.", minTier: "D", maxTier: "D" },
    { text: "The {noun} flickers at the bottom of measurable readings.", minTier: "D", maxTier: "D" },
    { text: "Faint static is the loudest thing around this {noun} setup.", minTier: "D", maxTier: "D" },
    // C
    { text: "The {noun} hums with rookie discipline still finding its footing.", minTier: "C", maxTier: "C" },
    { text: "Modest current threading the {noun}, foundations are taking shape now.", minTier: "C", maxTier: "C" },
    { text: "An honest {noun} drawing the early outlines of a power signature.", minTier: "C", maxTier: "C" },
    // B
    { text: "Real wattage detected behind this {noun} and its disciplined posture.", minTier: "B", maxTier: "B" },
    { text: "The {noun} is holding ground that smaller signals cannot reach.", minTier: "B", maxTier: "B" },
    { text: "Composure radiates from the {noun} with measurable structural authority.", minTier: "B", maxTier: "B" },
    // A
    { text: "Dangerous wattage stacks behind the {noun} with audible discipline.", minTier: "A", maxTier: "A" },
    { text: "This {noun} is operating two tiers above the local average.", minTier: "A", maxTier: "A" },
    { text: "The {noun} pulls heat out of every nearby ambient reading.", minTier: "A", maxTier: "A" },
    // S
    { text: "Dominion radiates outward whenever the {noun} draws breath in frame.", minTier: "S", maxTier: "S" },
    { text: "The {noun} bends ambient power toward its own gravity well.", minTier: "S", maxTier: "S" },
    { text: "Adversaries thin out around any {noun} that registers like this.", minTier: "S", maxTier: "S" },
    // SS
    { text: "Few {noun} signatures ever register at this rarefied amplitude band.", minTier: "SS", maxTier: "SS" },
    { text: "Sovereign current courses through the {noun} without visible effort today.", minTier: "SS", maxTier: "SS" },
    { text: "The {noun} is rewriting the local definition of authority itself.", minTier: "SS", maxTier: "SS" },
    // SSS
    { text: "Continental tremor follows wherever this {noun} chooses to manifest visibly.", minTier: "SSS", maxTier: "SSS" },
    { text: "The {noun} is operating outside the reach of standard scouters.", minTier: "SSS", maxTier: "SSS" },
    { text: "Mythic resonance coats the {noun} like an inherited birthright signal.", minTier: "SSS", maxTier: "SSS" },
    // LIMITLESS
    { text: "Instrumentation collapses while attempting to bracket this {noun} altogether today.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "The {noun} is the upper bound of what we measure here.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Only a {noun} like this leaks past every containment threshold.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
  ],

  FITNESS: [
    // D
    { text: "The {noun} barely clears the threshold of measurable intent today.", minTier: "D", maxTier: "D" },
    { text: "A lean signal flickers around this {noun} without firing through.", minTier: "D", maxTier: "D" },
    { text: "Discipline is whispering at this {noun} from the back row.", minTier: "D", maxTier: "D" },
    // C
    { text: "Honest reps are sharpening the {noun} into something teachable now.", minTier: "C", maxTier: "C" },
    { text: "The {noun} is climbing the staircase that builds true power.", minTier: "C", maxTier: "C" },
    { text: "Foundations are setting underneath this {noun} with patient resolve forming.", minTier: "C", maxTier: "C" },
    // B
    { text: "Power output around the {noun} is no longer asking permission.", minTier: "B", maxTier: "B" },
    { text: "The {noun} carries weight that opens locked doors quietly today.", minTier: "B", maxTier: "B" },
    { text: "Threat readings bend toward this {noun} during ambient passive scans.", minTier: "B", maxTier: "B" },
    // A
    { text: "The {noun} is shedding mortality in real time at scale.", minTier: "A", maxTier: "A" },
    { text: "Heavy wattage stacks behind the {noun} like coiled engine cores.", minTier: "A", maxTier: "A" },
    { text: "Adversaries recalibrate the moment this {noun} steps into a frame.", minTier: "A", maxTier: "A" },
    // S
    { text: "Dominion radiates from the {noun} the way thunder claims geography.", minTier: "S", maxTier: "S" },
    { text: "The {noun} commands the room before drawing a single breath.", minTier: "S", maxTier: "S" },
    { text: "Few competitors survive an opening glance from this {noun} today.", minTier: "S", maxTier: "S" },
    // SS
    { text: "Sovereign current threads through the {noun} without strain or pretense.", minTier: "SS", maxTier: "SS" },
    { text: "The {noun} bends the local field of expectation in frame.", minTier: "SS", maxTier: "SS" },
    { text: "Legendary readings gather beneath the surface of this {noun} today.", minTier: "SS", maxTier: "SS" },
    // SSS
    { text: "The {noun} refuses to align with any scouter's calibration band.", minTier: "SSS", maxTier: "SSS" },
    { text: "Mythic load travels through the {noun} like patient quiet weather.", minTier: "SSS", maxTier: "SSS" },
    { text: "This {noun} is rewriting the upper edge of the discipline.", minTier: "SSS", maxTier: "SSS" },
    // LIMITLESS
    { text: "The {noun} terminates every attempt to find its measurable ceiling.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Containment fields buckle whenever this {noun} clears the operational threshold.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Only a {noun} like this exists outside our measured range today.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
  ],

  DRIP: [
    // D
    { text: "The {noun} struggles to broadcast across the same small room.", minTier: "D", maxTier: "D" },
    { text: "Faint texture is all this {noun} brings to the table.", minTier: "D", maxTier: "D" },
    { text: "A whisper of intent leaves the {noun} unable to land hard.", minTier: "D", maxTier: "D" },
    // C
    { text: "Style discipline is forming around the {noun} with cautious early steps.", minTier: "C", maxTier: "C" },
    { text: "The {noun} is rehearsing fluency the room has not recognized yet.", minTier: "C", maxTier: "C" },
    { text: "Early cohesion threads the {noun} together with workable practical intent.", minTier: "C", maxTier: "C" },
    // B
    { text: "The {noun} lands with rhythm that turns honest watching heads.", minTier: "B", maxTier: "B" },
    { text: "Recognizable authority radiates from the {noun} during ambient passing scans.", minTier: "B", maxTier: "B" },
    { text: "Tasteful current flows through the {noun} without raising the volume.", minTier: "B", maxTier: "B" },
    // A
    { text: "Heavy fluency stacks behind every angle of this practiced {noun}.", minTier: "A", maxTier: "A" },
    { text: "The {noun} forces the room into a different posture entirely.", minTier: "A", maxTier: "A" },
    { text: "Threat-grade taste pours off this {noun} on visible first contact.", minTier: "A", maxTier: "A" },
    // S
    { text: "Dominion threads through the {noun} as though it inherited rooms.", minTier: "S", maxTier: "S" },
    { text: "The {noun} bends every camera within line of sight today.", minTier: "S", maxTier: "S" },
    { text: "Adversarial fits dim around this {noun} on visible first contact.", minTier: "S", maxTier: "S" },
    // SS
    { text: "Sovereign tailoring traces every movement of the {noun} between angles.", minTier: "SS", maxTier: "SS" },
    { text: "The {noun} commands a frequency the room cannot replicate today.", minTier: "SS", maxTier: "SS" },
    { text: "Legendary cadence walks beside this {noun} through every passing angle.", minTier: "SS", maxTier: "SS" },
    // SSS
    { text: "The {noun} eats lightning meant for far lesser ordinary silhouettes.", minTier: "SSS", maxTier: "SSS" },
    { text: "Mythic gravity orbits the {noun} regardless of the surrounding background.", minTier: "SSS", maxTier: "SSS" },
    { text: "Few catalogs even contain reliable blueprints for this {noun} today.", minTier: "SSS", maxTier: "SSS" },
    // LIMITLESS
    { text: "The {noun} resets every standard the discipline thought it owned.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Containment vocabulary dissolves when this {noun} enters their ordinary reach.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Only a {noun} like this rewrites the language of presence.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
  ],

  PETS: [
    // D
    { text: "The {noun} barely breaks ambient calm across the surrounding small room.", minTier: "D", maxTier: "D" },
    { text: "Untamed potential idles inside this {noun} without firing through yet.", minTier: "D", maxTier: "D" },
    { text: "A faint instinct flickers behind the {noun} half the time today.", minTier: "D", maxTier: "D" },
    // C
    { text: "The {noun} is rehearsing menace in measured private quiet bursts.", minTier: "C", maxTier: "C" },
    { text: "Early chaos threads the {noun} into something almost tactical now.", minTier: "C", maxTier: "C" },
    { text: "Brain activity around the {noun} ticks above the baseline reading.", minTier: "C", maxTier: "C" },
    // B
    { text: "The {noun} draws a quieter room around its centered presence.", minTier: "B", maxTier: "B" },
    { text: "Discipline hums beneath the {noun} between every casual ambient movement.", minTier: "B", maxTier: "B" },
    { text: "Aura output trails the {noun} like a known ambient shadow.", minTier: "B", maxTier: "B" },
    // A
    { text: "Threat-grade instinct pours from the {noun} on a passing glance.", minTier: "A", maxTier: "A" },
    { text: "The {noun} is two leagues above its declared species class.", minTier: "A", maxTier: "A" },
    { text: "Heavy chaos coils behind every small motion this {noun} releases.", minTier: "A", maxTier: "A" },
    // S
    { text: "Dominion radiates from the {noun} like a hereditary ancestral right.", minTier: "S", maxTier: "S" },
    { text: "Lesser animals lower their tails near this passing {noun} today.", minTier: "S", maxTier: "S" },
    { text: "The {noun} bends ambient instinct toward its own quiet pulse.", minTier: "S", maxTier: "S" },
    // SS
    { text: "Sovereign menace threads through the {noun} with patient terminal certainty.", minTier: "SS", maxTier: "SS" },
    { text: "The {noun} commands the territory without raising a single sound.", minTier: "SS", maxTier: "SS" },
    { text: "Legendary readings gather around this {noun} at every quiet approach.", minTier: "SS", maxTier: "SS" },
    // SSS
    { text: "Mythic intelligence sits behind the eyes of this watching {noun}.", minTier: "SSS", maxTier: "SSS" },
    { text: "The {noun} refuses to align with any scouter field calibration.", minTier: "SSS", maxTier: "SSS" },
    { text: "Containment instinct travels with this {noun} between adjoining quiet rooms.", minTier: "SSS", maxTier: "SSS" },
    // LIMITLESS
    { text: "The {noun} terminates every comparison the species registry attempts now.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Reality flexes whenever this {noun} chooses to be physically present.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Only a {noun} like this slips past every kennel containment.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
  ],

  RIDES: [
    // D
    { text: "The {noun} barely registers above ambient mechanical idle floor noise.", minTier: "D", maxTier: "D" },
    { text: "Faint horsepower flickers around this {noun} during idle ambient scans.", minTier: "D", maxTier: "D" },
    { text: "A quiet engine signature holds the {noun} below threshold today.", minTier: "D", maxTier: "D" },
    // C
    { text: "The {noun} hums with starter authority finally finding its rhythm.", minTier: "C", maxTier: "C" },
    { text: "Honest current threads the {noun} as the foundation tightens slowly.", minTier: "C", maxTier: "C" },
    { text: "Early dominance whispers behind the {noun} from the open curb.", minTier: "C", maxTier: "C" },
    // B
    { text: "Real horsepower stacks underneath this {noun} when it leans forward.", minTier: "B", maxTier: "B" },
    { text: "The {noun} earns a longer second look at any traffic light.", minTier: "B", maxTier: "B" },
    { text: "Street presence radiates from the {noun} during a still scan.", minTier: "B", maxTier: "B" },
    // A
    { text: "Heavy threat output coils behind every panel of the {noun}.", minTier: "A", maxTier: "A" },
    { text: "The {noun} pulls heat out of competing signatures parked nearby.", minTier: "A", maxTier: "A" },
    { text: "Dominance pours from the {noun} the moment ignition lands hard.", minTier: "A", maxTier: "A" },
    // S
    { text: "Sovereign torque threads through the {noun} on every measured breath.", minTier: "S", maxTier: "S" },
    { text: "The {noun} commands the lane before signaling a single turn.", minTier: "S", maxTier: "S" },
    { text: "Adversary cars dim around this {noun} on visible first contact.", minTier: "S", maxTier: "S" },
    // SS
    { text: "Legendary horsepower aura clings to the {noun} through every angle.", minTier: "SS", maxTier: "SS" },
    { text: "The {noun} bends asphalt expectation toward its own quiet pulse.", minTier: "SS", maxTier: "SS" },
    { text: "Few engines ever resonate at the frequency this {noun} runs.", minTier: "SS", maxTier: "SS" },
    // SSS
    { text: "Mythic pressure travels beside the {noun} between every passing block.", minTier: "SSS", maxTier: "SSS" },
    { text: "The {noun} refuses to align with any racing classification scheme.", minTier: "SSS", maxTier: "SSS" },
    { text: "Containment signal collapses near this {noun} on closing approach.", minTier: "SSS", maxTier: "SSS" },
    // LIMITLESS
    { text: "The {noun} terminates every chart the speed registry recognizes today.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Asphalt remembers the moment this {noun} crossed its measured threshold.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Only a {noun} like this leaks past the calibration ceiling.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
  ],

  WILDCARD: [
    // D
    { text: "The {noun} barely registers across the wildcard ambient frequency band.", minTier: "D", maxTier: "D" },
    { text: "Faint chaos flickers around this {noun} without yet taking shape.", minTier: "D", maxTier: "D" },
    { text: "Mystery factor hovers near baseline behind this {noun} today still.", minTier: "D", maxTier: "D" },
    // C
    { text: "Early rarity threads the {noun} into something tracking quietly upward.", minTier: "C", maxTier: "C" },
    { text: "The {noun} is rehearsing menace the registry has not named yet.", minTier: "C", maxTier: "C" },
    { text: "Honest aura output trails the {noun} between casual ambient movements.", minTier: "C", maxTier: "C" },
    // B
    { text: "Real signature stacks behind this {noun} on a still ambient scan.", minTier: "B", maxTier: "B" },
    { text: "The {noun} carries weight that bends the surrounding room quietly.", minTier: "B", maxTier: "B" },
    { text: "Recognizable energy travels with the {noun} through ambient surrounding frames.", minTier: "B", maxTier: "B" },
    // A
    { text: "Heavy chaos coils behind every motion the {noun} quietly releases.", minTier: "A", maxTier: "A" },
    { text: "The {noun} pulls focus out of every nearby ambient reading.", minTier: "A", maxTier: "A" },
    { text: "Threat-grade rarity pours from this {noun} on visible first contact.", minTier: "A", maxTier: "A" },
    // S
    { text: "Dominion threads through the {noun} like inherited overhead ambient weather.", minTier: "S", maxTier: "S" },
    { text: "The {noun} commands frequencies the registry cannot reproduce today still.", minTier: "S", maxTier: "S" },
    { text: "Sovereign mystery walks beside this {noun} into every ambient room.", minTier: "S", maxTier: "S" },
    // SS
    { text: "Legendary aura output trails the {noun} between every ambient angle.", minTier: "SS", maxTier: "SS" },
    { text: "The {noun} bends the scouter toward its own ambient resonance.", minTier: "SS", maxTier: "SS" },
    { text: "Few signatures ever land near the band this {noun} occupies.", minTier: "SS", maxTier: "SS" },
    // SSS
    { text: "Mythic rarity orbits the {noun} regardless of categorization attempts today.", minTier: "SSS", maxTier: "SSS" },
    { text: "The {noun} refuses every label the registry tries to assign.", minTier: "SSS", maxTier: "SSS" },
    { text: "Containment protocols soften whenever this {noun} enters their ordinary reach.", minTier: "SSS", maxTier: "SSS" },
    // LIMITLESS
    { text: "The {noun} terminates every taxonomy the scouter recognizes here today.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Reality flexes whenever this {noun} settles into our analytic frame.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
    { text: "Only a {noun} like this slips past every analytic threshold.", minTier: "LIMITLESS", maxTier: "LIMITLESS" },
  ],
};

/* -------------------------------------------------------------------- */
/*  Public API                                                          */
/* -------------------------------------------------------------------- */

/**
 * Pick a deterministic fallback commentary line.
 *
 * Selection is fully driven by `seed`: same `seed` and same
 * `(category, tier, imageNouns)` shape returns the same string. The
 * chosen image noun is substituted into the template's `{noun}` slot
 * exactly once.
 *
 * Noun selection: short nouns (1–2 whitespace tokens after trim) are
 * preferred so the slop detector's 8–14 word band is never breached
 * by a long compound noun. Empty / whitespace-only entries are
 * filtered. If no qualifying noun is supplied (the neutral-fallback
 * path can pass `[]`), the category's representative noun is used so
 * the function always succeeds and the slop detector grounding rule
 * always passes.
 *
 * Template selection: only templates whose `[minTier, maxTier]` band
 * contains `tier` are eligible. The constructor of
 * `FALLBACK_TEMPLATES` covers all eight tiers per category, so this
 * set is never empty in practice; if a future edit ever broke that
 * invariant, `pickFallback` falls back to the full template list for
 * the category rather than throwing, and the build-time check below
 * surfaces the misconfiguration on the next import.
 */
export function pickFallback(
  category: Category,
  tier: Tier,
  imageNouns: readonly string[],
  seed: number,
): string {
  const rng = mulberry32(seed);

  // Pick a noun first so the template-picking RNG draw is independent of
  // noun length. Noun selection consumes one rng() call regardless of
  // input cardinality, keeping the determinism boundary stable.
  const nounDraw = rng();
  const chosenNoun = pickNoun(category, imageNouns, nounDraw);

  // Pick a template from those whose tier band covers the requested tier.
  const eligibleTemplates = templatesForTier(category, tier);
  const templateDraw = rng();
  const templateIndex = Math.floor(templateDraw * eligibleTemplates.length);
  const template =
    eligibleTemplates[templateIndex] ?? eligibleTemplates[0]!;

  return template.text.replace("{noun}", chosenNoun);
}

/**
 * Filter `FALLBACK_TEMPLATES[category]` to entries whose tier band
 * covers `tier`. Falls back to the full list if (defensively) nothing
 * matches; the build-time check at the bottom of this file ensures
 * every tier is covered for every category, so the fallback path
 * exists only as a runtime safety net.
 */
function templatesForTier(
  category: Category,
  tier: Tier,
): ReadonlyArray<FallbackTemplate> {
  const tIdx = tierIndex(tier);
  const list = FALLBACK_TEMPLATES[category];
  const matches = list.filter(
    (t) => tierIndex(t.minTier) <= tIdx && tIdx <= tierIndex(t.maxTier),
  );
  return matches.length > 0 ? matches : list;
}

/**
 * Pick a single noun for substitution given the supplied
 * `imageNouns`. Empty/whitespace entries are dropped; entries with
 * more than two whitespace tokens are dropped (long compound nouns
 * could push commentary past the 14-word slop ceiling). If no noun
 * survives the filter, the category's representative noun is used.
 */
function pickNoun(
  category: Category,
  imageNouns: readonly string[],
  draw: number,
): string {
  const eligible: string[] = [];
  for (const raw of imageNouns) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length > 2) continue;
    eligible.push(trimmed);
  }
  if (eligible.length === 0) return defaultNounFor(category);
  const idx = Math.floor(draw * eligible.length);
  return eligible[idx] ?? eligible[0]!;
}

/* -------------------------------------------------------------------- */
/*  Build-time slop check                                               */
/* -------------------------------------------------------------------- */

/**
 * Run every template through `detectSlop` with its category's
 * representative noun. Throws on the first failure with the failing
 * template's category, tier band, text, and rejection reason so the
 * regression is unambiguous.
 *
 * The check runs once at module load; subsequent imports see the
 * cached module and skip the work. This is the regression guard
 * called for in tasks.md → 8.4 acceptance criteria.
 *
 * Property 18 ("Fallback Never Slop") in task 8.5 generalises this
 * check to arbitrary `(category, tier, nouns, seed)` inputs.
 */
function assertNoTemplateProducesSlop(): void {
  const categories: ReadonlyArray<Category> = [
    "SETUPS",
    "FITNESS",
    "DRIP",
    "PETS",
    "RIDES",
    "WILDCARD",
  ];

  for (const category of categories) {
    const templates = FALLBACK_TEMPLATES[category];

    if (templates.length < 24) {
      throw new Error(
        `@workspace/vision: fallback library for ${category} has ${templates.length} templates; minimum is 24.`,
      );
    }

    // Every tier must be covered by at least one template.
    for (const tier of TIER_ORDER) {
      const covers = templates.some(
        (t) =>
          tierIndex(t.minTier) <= tierIndex(tier) &&
          tierIndex(tier) <= tierIndex(t.maxTier),
      );
      if (!covers) {
        throw new Error(
          `@workspace/vision: fallback library for ${category} has no template covering tier ${tier}.`,
        );
      }
    }

    const noun = REPRESENTATIVE_NOUN[category];
    for (const template of templates) {
      if (!template.text.includes("{noun}")) {
        throw new Error(
          `@workspace/vision: template "${template.text}" in ${category} is missing the {noun} slot.`,
        );
      }
      const occurrences = template.text.split("{noun}").length - 1;
      if (occurrences !== 1) {
        throw new Error(
          `@workspace/vision: template "${template.text}" in ${category} must contain exactly one {noun} slot (found ${occurrences}).`,
        );
      }

      const substituted = template.text.replace("{noun}", noun);
      const verdict = detectSlop(substituted, [noun]);
      if (!verdict.ok) {
        throw new Error(
          `@workspace/vision: fallback template produced slop (reason=${verdict.reason}) ` +
            `category=${category} band=[${template.minTier},${template.maxTier}] ` +
            `text="${template.text}" substituted="${substituted}".`,
        );
      }
    }
  }
}

assertNoTemplateProducesSlop();

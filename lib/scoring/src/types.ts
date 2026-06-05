/**
 * Shared type surface for the deterministic scoring engine.
 *
 * These types are the lingua franca of `@workspace/scoring`: every public
 * function in `score.ts`, `category-stats.ts`, and (downstream) `anomaly.ts`
 * speaks in terms of them, so they live in this file rather than alongside
 * any single implementation.
 */

/**
 * The six user-selectable scan categories.
 *
 * Mirrors the API contract (`lib/api-spec/openapi.yaml`) and the
 * `category` enum on the `scans` table. Strings are upper-snake to match
 * Requirement 3.1's enumerated set.
 */
export type Category =
  | "SETUPS"
  | "FITNESS"
  | "DRIP"
  | "PETS"
  | "RIDES"
  | "WILDCARD";

/**
 * Tier badge assigned to a score. Ordered from weakest (`D`) to strongest
 * (`LIMITLESS`); see `scoreToTier` in `score.ts` for the canonical bands.
 */
export type Tier =
  | "D"
  | "C"
  | "B"
  | "A"
  | "S"
  | "SS"
  | "SSS"
  | "LIMITLESS";

/**
 * Rare reveal event assigned to some Scans. At most one per Scan
 * (Requirement 7.3). Ordering matches the canonical declaration in the API
 * spec and the database `anomaly_type` enum.
 *
 * Of the five members:
 *   - `SCOUTER_FAILURE` and `UNREGISTERED_ENERGY` are visual-only — they
 *     never modify the Score (Requirements 7.6, 7.7).
 *   - `POWER_SURGE_DETECTED`, `FORBIDDEN_AURA`, and `CHAOS_SPIKE` apply a
 *     Score modifier within their documented band (Requirements 7.4, 7.5,
 *     7.8) and the result is clamped to `[1000, 100000]` (Requirement 7.9).
 */
export type AnomalyType =
  | "POWER_SURGE_DETECTED"
  | "FORBIDDEN_AURA"
  | "SCOUTER_FAILURE"
  | "UNREGISTERED_ENERGY"
  | "CHAOS_SPIKE";

/**
 * The four Core Stats present on every Scan, regardless of category.
 *
 * Each value is a non-negative integer in the inclusive range `[0, 10000]`.
 */
export interface CoreStats {
  aura: number;
  power: number;
  status: number;
  threat: number;
}

/**
 * The five Category-specific Stats produced for each Scan.
 *
 * The exact key set varies per `Category`; see `CATEGORY_STATS` in
 * `category-stats.ts` for the canonical names per category. Each value
 * is a non-negative integer in the inclusive range `[0, 10000]`.
 */
export type CategoryStats = Record<string, number>;

/**
 * Trait confidences as supplied by the Vision Model (or, on full failure,
 * a deterministic neutral fallback derived from the perceptual hash).
 *
 * Each confidence is an integer in the inclusive range `[1, 10]`.
 */
export interface TraitConfidences {
  core: {
    aura: number;
    power: number;
    status: number;
    threat: number;
  };
  /**
   * Five entries keyed by the per-Category stat names from
   * `CATEGORY_STATS`. Validation that the right keys are present lives in
   * the Vision adapter; the scoring engine only requires that there are
   * five numeric values 1..10.
   */
  category: Record<string, number>;
}

/**
 * Pure input bundle to the scoring functions.
 *
 * The scoring engine is deterministic at this boundary: identical
 * `ScoringInput` always yields identical outputs from `computeScore`,
 * `computeStats`, and `scoreToTier`.
 */
export interface ScoringInput {
  category: Category;
  traitConfidences: TraitConfidences;
}

export type SubjectClass =
  | "iconic"
  | "reverence_protected"
  | "anti_iconic"
  | "trying_too_hard"
  | "mid"
  | "satirical_inversion"
  | "sacred_or_memorial"
  | "first_attempt_earnest";

export type JokeTarget = "the_powerful" | "the_vulnerable" | "self_aware" | "none";

export type MemeticStatus = "iconic_template" | "fresh_meme" | "aged_meme" | "non_meme";

export type BrandSlug =
  | "margiela"
  | "rick_owens"
  | "raf_simons"
  | "helmut_lang"
  | "acne"
  | "ape_leon_dore"
  | "carhartt_wip"
  | "apc"
  | "comme_des_garcons"
  | "yohji_yamamoto"
  | "issey_miyake"
  | "apple_pro_display"
  | "herman_miller"
  | "steelcase_leap"
  | "hhkb"
  | "topre_realforce"
  | "ducky"
  | "keychron"
  | "fellow_kettle"
  | "hario_v60"
  | "porsche_911"
  | "mclaren"
  | "ferrari"
  | "bmw_m"
  | "bugatti"
  | "rogue_fitness"
  | "eleiko"
  | "powerlvl";

export type VerdictFlavor =
  | "menace"
  | "absurdity"
  | "wholesome"
  | "pretension"
  | "meme"
  | "iconic"
  | "default";

export interface CulturalReading {
  image_subjects: string[];
  archetype: string;
  subject_class: SubjectClass;
  joke_target: JokeTarget;
  memetic_status: MemeticStatus;
  taste_demonstrated_score: number;
  cultural_recognition_score: number;
  absurdity_level: number;
  sincerity_level: number;
  pretension_level: number;
  menace_level: number;
  wholesomeness_level: number;
  powerlvl_brand_visible: boolean;
  taste_brands_visible: string[];
  category_match_score: number;
  anomaly_signal: AnomalyType | null;
  cultural_notes: string;
}

export interface ModifierLog {
  name: string;
  condition: string;
  action: "floor" | "ceiling" | "pull" | "bonus" | "penalty";
  scoreBefore: number;
  scoreAfter: number;
}

export interface RenderedScore {
  score: number;
  tier: Tier;
  verdictNoun: string;
  coreStats: CoreStats;
  categoryStats: CategoryStats;
  modifiersApplied: ModifierLog[];
  scorePreModifiers: number;
}

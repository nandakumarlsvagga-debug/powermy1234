/**
 * `@workspace/scoring` — public surface.
 *
 * Re-exports the deterministic scoring core, the per-Category stat catalog,
 * the seeded mulberry32 PRNG, and the deterministic Anomaly engine.
 */

export type {
  AnomalyType,
  Category,
  CategoryStats,
  CoreStats,
  ScoringInput,
  Tier,
  TraitConfidences,
  SubjectClass,
  JokeTarget,
  MemeticStatus,
  BrandSlug,
  VerdictFlavor,
  CulturalReading,
  ModifierLog,
  RenderedScore,
} from "./types.js";

export { CATEGORY_STATS, statNamesFor } from "./category-stats.js";

export {
  CATEGORY_WEIGHT_EACH,
  CATEGORY_WEIGHT_TOTAL,
  CORE_WEIGHTS,
  MAX_SCORE,
  MAX_STAT,
  MIN_SCORE,
  MIN_STAT,
  TIER_ORDER,
  TOTAL_WEIGHT,
  computeBaseScan,
  computeScore,
  computeStats,
  confidenceToStat,
  scoreToTier,
  tierIndex,
} from "./score.js";

export { mulberry32 } from "./prng.js";

export type { AnomalyApplication, AnomalySeedInput } from "./anomaly.js";
export {
  ANOMALY_MODIFIER_BANDS,
  ANOMALY_SCORE_MODIFIERS,
  ANOMALY_TOTAL_WEIGHT,
  ANOMALY_VISUAL_ONLY,
  ANOMALY_WEIGHTS,
  applyAnomalyModifier,
  deriveAnomalySeed,
  drawAnomaly,
} from "./anomaly.js";

export { renderScore } from "./render.js";
export { VERDICT_NOUNS, pickVerdictNoun, dominantFlavor } from "./verdict-nouns.js";
export { TASTE_BRANDS } from "./taste-brands.js";
export type { BrandMetadata } from "./taste-brands.js";

/**
 * Per-Category stat name catalog.
 *
 * The five stat names per category are the names rendered on the Result
 * Screen, the Share Card, and the Feed entry, and they are the keys used
 * inside `TraitConfidences.category` and `CategoryStats`.
 *
 * The Wildcard set comes from Requirement 6.6; the other five sets come
 * from Requirement 6.7. Order is significant — it is the on-card render
 * order — so this map preserves it.
 */

import type { Category } from "./types.js";

export const CATEGORY_STATS = {
  SETUPS: [
    "Processing Power",
    "Lock-In Rate",
    "Build Quality",
    "Threat Output",
    "RGB Stability",
  ],
  FITNESS: [
    "Power Output",
    "Discipline Index",
    "Stamina Core",
    "Aura Level",
    "Threat Rating",
  ],
  DRIP: [
    "Rizz Level",
    "Style Sync",
    "Flex Value",
    "Trend Energy",
    "Aura Output",
  ],
  PETS: [
    "Menace Level",
    "Chaos Index",
    "Divine Energy",
    "Brain Activity",
    "Aura Output",
  ],
  RIDES: [
    "Horsepower Aura",
    "Dominance Output",
    "Street Presence",
    "Threat Level",
    "Engine Energy",
  ],
  WILDCARD: [
    "Mystery Factor",
    "Aura Output",
    "Chaos Index",
    "Rarity Score",
    "Energy Signature",
  ],
} as const satisfies Record<Category, readonly [string, string, string, string, string]>;

/** Convenience: the five stat names for a category, in render order. */
export function statNamesFor(category: Category): readonly string[] {
  return CATEGORY_STATS[category];
}

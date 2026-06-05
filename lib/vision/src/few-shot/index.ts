/**
 * Few-shot example registry for the Bedrock Nova Lite adapter.
 *
 * Maps each `Category` to its file's exported example array. The
 * Bedrock client (`bedrock-client.ts`) reads from this registry at
 * call time when assembling the per-Category system prompt.
 *
 * Per Requirement 5.4 each Category exposes 12–20 examples. The
 * build-time sanity test in `test/few-shot.spec.ts` enforces both
 * the count band and the slop-detector contract on every example.
 */

import type { Category } from "../types.js";
import { DRIP_FEW_SHOT } from "./drip.js";
import { FITNESS_FEW_SHOT } from "./fitness.js";
import { PETS_FEW_SHOT } from "./pets.js";
import { RIDES_FEW_SHOT } from "./rides.js";
import { SETUPS_FEW_SHOT } from "./setups.js";
import type { FewShotExample } from "./types.js";
import { WILDCARD_FEW_SHOT } from "./wildcard.js";

export type { FewShotExample } from "./types.js";

/**
 * Per-Category few-shot example arrays. Each array holds 12–20
 * `FewShotExample` records (Requirement 5.4). The arrays are
 * `readonly` to keep them shareable across calls without copying.
 */
export const FEW_SHOT_EXAMPLES = {
  SETUPS: SETUPS_FEW_SHOT,
  FITNESS: FITNESS_FEW_SHOT,
  DRIP: DRIP_FEW_SHOT,
  PETS: PETS_FEW_SHOT,
  RIDES: RIDES_FEW_SHOT,
  WILDCARD: WILDCARD_FEW_SHOT,
} as const satisfies Record<Category, readonly FewShotExample[]>;

/** Convenience: examples for a category, in declaration order. */
export function fewShotFor(category: Category): readonly FewShotExample[] {
  return FEW_SHOT_EXAMPLES[category];
}

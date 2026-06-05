/**
 * WILDCARD few-shot examples for the Bedrock Nova Lite adapter.
 *
 * The Wildcard category accepts anything that does not fit the other
 * five Categories: ephemera, weather, food, art, archives, oddities.
 * The Wildcard stat names (Mystery Factor, Aura Output, Chaos Index,
 * Rarity Score, Energy Signature) come from Requirement 6.6.
 *
 * See `./setups.ts` for the slop-detector contract every example must
 * satisfy. The build-time sanity test re-runs `detectSlop` against
 * every example.
 */

import type { FewShotExample } from "./types.js";

export const WILDCARD_FEW_SHOT: readonly FewShotExample[] = [
  {
    scene: "Lightning forking across a dark prairie sky with a lone tree.",
    imageNouns: ["lightning", "sky", "tree"],
    commentary:
      "Lightning rewrites that sky; the tree on the prairie agrees to nothing.",
  },
  {
    scene: "Plate of ramen with a soft egg under steam in a noodle bar.",
    imageNouns: ["ramen", "egg", "broth"],
    commentary:
      "That ramen quiets the room; the egg crowns broth like a luminous summons.",
  },
  {
    scene: "Old film camera on a wooden table beside an unspooled roll.",
    imageNouns: ["camera", "table", "film"],
    commentary:
      "The camera holds court at that table; film coils confess the frame count.",
  },
  {
    scene: "Half-finished oil painting on an easel with paint tubes scattered.",
    imageNouns: ["painting", "easel", "tubes"],
    commentary:
      "That painting interrogates the easel; paint tubes look guilty by association.",
  },
  {
    scene: "City skyline blanketed in fog at dawn with a single bridge visible.",
    imageNouns: ["skyline", "fog", "bridge"],
    commentary:
      "The skyline drinks that fog; this bridge is the only witness left awake.",
  },
  {
    scene: "Dusty arcade cabinet glowing in a dim basement room.",
    imageNouns: ["cabinet", "basement"],
    commentary:
      "That arcade cabinet rules the basement; an unseen audience leaves quarters by tradition.",
  },
  {
    scene: "Hand-bound notebook open to a page of dense ink diagrams.",
    imageNouns: ["notebook", "diagrams", "ink"],
    commentary:
      "That notebook crackles with ink; diagrams plot something the reader will not announce.",
  },
  {
    scene: "Mossy ruin with sunlight piercing a collapsed roof beam.",
    imageNouns: ["ruin", "moss", "beam"],
    commentary:
      "Sunlight finds that ruin; moss outranks the beam in continuity of service.",
  },
  {
    scene: "Plate of ordinary toast under flat overhead lighting.",
    imageNouns: ["toast", "plate"],
    commentary:
      "The toast lies on that plate the way a memo lies on a desk.",
  },
  {
    scene: "Closeup of a cracked geode split open on a velvet cloth.",
    imageNouns: ["geode", "cloth"],
    commentary:
      "That geode keeps cathedral hours; the cloth refuses to interrupt its private liturgy.",
  },
  {
    scene: "Telescope aimed at a starlit sky on a frigid mountain night.",
    imageNouns: ["telescope", "sky", "stars"],
    commentary:
      "The telescope interrogates that sky; stars file paperwork with every passing minute.",
  },
  {
    scene: "Untouched bookshelf of leatherbound volumes catching afternoon light.",
    imageNouns: ["bookshelf", "volumes", "light"],
    commentary:
      "That bookshelf catalogs the light; leatherbound volumes argue rank in slow motion.",
  },
] as const;

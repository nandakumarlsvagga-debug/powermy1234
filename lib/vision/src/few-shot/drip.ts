/**
 * DRIP few-shot examples for the Bedrock Nova Lite adapter.
 *
 * See `./setups.ts` for the slop-detector contract every example must
 * satisfy. The build-time sanity test re-runs `detectSlop` against
 * every example so future edits cannot ship a banned-word or
 * malformed line into the system prompt.
 */

import type { FewShotExample } from "./types.js";

export const DRIP_FEW_SHOT: readonly FewShotExample[] = [
  {
    scene: "Streetwear flex with layered jacket, designer chain, and unboxed kicks.",
    imageNouns: ["jacket", "chain", "kicks"],
    commentary:
      "That jacket carries the room; chain signs the receipt before kicks even land.",
  },
  {
    scene: "Tailored suit with a gold watch peeking from a starched cuff.",
    imageNouns: ["suit", "watch", "cuff"],
    commentary:
      "The suit fits like a verdict; that watch settles every cuff in the building.",
  },
  {
    scene: "Vintage trench coat over loose denim with a beat-up tote.",
    imageNouns: ["trench", "denim", "tote"],
    commentary:
      "The trench remembers a different decade; this denim respects the tote unconditionally.",
  },
  {
    scene: "Plain hoodie and old sneakers under harsh fluorescent light.",
    imageNouns: ["hoodie", "sneakers"],
    commentary:
      "The hoodie says nothing; those sneakers wish a louder fit had shown up.",
  },
  {
    scene: "Runway-style fit with leather pants, satin top, and platform boots.",
    imageNouns: ["pants", "top", "boots"],
    commentary:
      "Leather pants set the pace; the satin top finishes what those boots threaten.",
  },
  {
    scene: "Streetwear fit with deconstructed jeans, ringer tee, and a bucket hat.",
    imageNouns: ["jeans", "tee", "hat"],
    commentary:
      "Those jeans are doing surgery; the tee and hat hold the operating theater steady.",
  },
  {
    scene: "Athleisure look with a logo tracksuit and chunky white sneakers.",
    imageNouns: ["tracksuit", "sneakers"],
    commentary:
      "The tracksuit walks like it owns leases; those sneakers collect rent on every block.",
  },
  {
    scene: "Y2K throwback with low-rise cargos, a cropped baby tee, and butterfly clips.",
    imageNouns: ["cargos", "tee", "clips"],
    commentary:
      "Those cargos summon the era; the cropped tee and clips hold the timeline open.",
  },
  {
    scene: "Workwear fit with a chore coat, raw denim, and steel-toe boots.",
    imageNouns: ["coat", "denim", "boots"],
    commentary:
      "The chore coat earns its creases; this denim and those boots punch a clock.",
  },
  {
    scene: "Monochrome black ensemble with sharp tailoring and a leather bag.",
    imageNouns: ["coat", "trousers", "bag"],
    commentary:
      "The black coat eats light; trousers and that bag finish the silhouette without apology.",
  },
  {
    scene: "Gorpcore fit with technical shell, cargo shorts, and trail runners.",
    imageNouns: ["shell", "shorts", "runners"],
    commentary:
      "That shell is dressed to flee; cargo shorts and runners brief the exit plan.",
  },
  {
    scene: "Mismatched layering with clashing prints and wrinkled fabric.",
    imageNouns: ["shirt", "pants", "prints"],
    commentary:
      "The shirt argues with those pants; loud prints lose this fight on contact.",
  },
] as const;

/**
 * PETS few-shot examples for the Bedrock Nova Lite adapter.
 *
 * See `./setups.ts` for the slop-detector contract every example must
 * satisfy. The build-time sanity test re-runs `detectSlop` against
 * every example so future edits cannot ship a banned-word or
 * malformed line into the system prompt.
 */

import type { FewShotExample } from "./types.js";

export const PETS_FEW_SHOT: readonly FewShotExample[] = [
  {
    scene: "Black cat perched on a windowsill staring down a passing pigeon.",
    imageNouns: ["cat", "windowsill", "pigeon"],
    commentary:
      "That cat catalogs the pigeon; the windowsill belongs to whoever blinks last.",
  },
  {
    scene: "Husky mid-howl on a snowbank with frozen breath in the air.",
    imageNouns: ["husky", "snow", "breath"],
    commentary:
      "The husky drafts edicts into that snow; breath rises like a verdict.",
  },
  {
    scene: "Tiny puppy asleep on a folded blanket with one paw twitching.",
    imageNouns: ["puppy", "blanket", "paw"],
    commentary:
      "The puppy negotiates the blanket; that paw remembers a war it almost won.",
  },
  {
    scene: "Goldfish drifting alone in a slightly murky bowl.",
    imageNouns: ["goldfish", "bowl"],
    commentary:
      "The goldfish patrols its bowl with the dignity of a forgotten emperor.",
  },
  {
    scene: "Rescue mutt with a tilted head sitting on a rug.",
    imageNouns: ["mutt", "rug"],
    commentary:
      "That mutt tilts a head and the rug agrees to all subsequent terms.",
  },
  {
    scene: "Parrot mid-screech on a swing inside a tall cage.",
    imageNouns: ["parrot", "swing", "cage"],
    commentary:
      "The parrot rewrites the cage from that swing; the air owes it royalties.",
  },
  {
    scene: "Sleeping ferret coiled inside a knitted hammock.",
    imageNouns: ["ferret", "hammock"],
    commentary:
      "That ferret colonized the hammock and filed the paperwork in its sleep.",
  },
  {
    scene: "Maine coon stretched across a keyboard mid-paperwork.",
    imageNouns: ["coon", "keyboard"],
    commentary:
      "The coon overrides that keyboard; whatever shipped today shipped on its terms.",
  },
  {
    scene: "Hamster on its wheel running with intense focus at midnight.",
    imageNouns: ["hamster", "wheel"],
    commentary:
      "That hamster turns the wheel into a treadmill of secret personal grievances.",
  },
  {
    scene: "Senior labrador napping in a sunbeam by the door.",
    imageNouns: ["labrador", "sunbeam"],
    commentary:
      "The labrador occupies that sunbeam by hereditary right; nobody contests the deed.",
  },
  {
    scene: "Tortoise inching across a kitchen tile toward a slice of cucumber.",
    imageNouns: ["tortoise", "tile", "cucumber"],
    commentary:
      "The tortoise courts that cucumber across the tile with armored, patient menace.",
  },
  {
    scene: "Long-haired tabby grooming itself on a velvet armchair.",
    imageNouns: ["tabby", "armchair"],
    commentary:
      "That tabby audits the armchair; everyone else is a guest from now on.",
  },
] as const;

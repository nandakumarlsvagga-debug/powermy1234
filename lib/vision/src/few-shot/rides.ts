/**
 * RIDES few-shot examples for the Bedrock Nova Lite adapter.
 *
 * See `./setups.ts` for the slop-detector contract every example must
 * satisfy. The build-time sanity test re-runs `detectSlop` against
 * every example so future edits cannot ship a banned-word or
 * malformed line into the system prompt.
 */

import type { FewShotExample } from "./types.js";

export const RIDES_FEW_SHOT: readonly FewShotExample[] = [
  {
    scene: "Tuned coupe with carbon hood backlit on a wet midnight street.",
    imageNouns: ["coupe", "hood", "street"],
    commentary:
      "That coupe owns the street; carbon hood drinks the rain like a coronation.",
  },
  {
    scene: "Lifted truck with mud-caked tires parked on a gravel lot.",
    imageNouns: ["truck", "tires", "lot"],
    commentary:
      "The truck wears that mud like medals; this lot earned a quiet ovation.",
  },
  {
    scene: "Vintage muscle car idling in a sunlit garage with chrome trim.",
    imageNouns: ["car", "garage", "chrome"],
    commentary:
      "That muscle car idles like a courtroom; the garage chrome takes the minutes.",
  },
  {
    scene: "Stock commuter sedan with curb rash and dust under fluorescent lighting.",
    imageNouns: ["sedan", "curb", "dust"],
    commentary:
      "The sedan logs miles without ceremony; that curb rash and dust handle the rest.",
  },
  {
    scene: "Cafe racer leaned over a tank under a streetlight.",
    imageNouns: ["racer", "tank", "streetlight"],
    commentary:
      "The cafe racer leans into that tank; the streetlight nods toward future trouble.",
  },
  {
    scene: "Slammed sport sedan with deep-dish wheels on a downtown corner.",
    imageNouns: ["sedan", "wheels", "corner"],
    commentary:
      "That sedan whispers from the corner; deep-dish wheels translate everything into menace.",
  },
  {
    scene: "Off-road build with light bar and roof tent at a desert overlook.",
    imageNouns: ["build", "tent", "overlook"],
    commentary:
      "The build claims that overlook; roof tent files paperwork before the sun resets.",
  },
  {
    scene: "Vintage bicycle leaning against a brick wall in golden hour.",
    imageNouns: ["bicycle", "wall"],
    commentary:
      "The bicycle leans on that wall like a story it refuses to retell.",
  },
  {
    scene: "Hypercar parked at valet with the door cracked open and key fob exposed.",
    imageNouns: ["hypercar", "valet", "fob"],
    commentary:
      "The hypercar dares the valet; that fob escalates terms with every onlooker.",
  },
  {
    scene: "Tracked rally hatchback with mud-splatter livery and rally tires.",
    imageNouns: ["hatchback", "livery", "tires"],
    commentary:
      "The hatchback drags that livery across stages; rally tires bill by the kilometer.",
  },
  {
    scene: "Boat trailered behind a pickup at a quiet ramp on a misty morning.",
    imageNouns: ["boat", "pickup", "ramp"],
    commentary:
      "The boat waits behind that pickup; this ramp keeps the morning mist on retainer.",
  },
  {
    scene: "Restomod muscle car under a single garage spotlight with polished paint.",
    imageNouns: ["restomod", "garage", "paint"],
    commentary:
      "Spotlight catches that restomod; garage paint reflects an afternoon of patient menace.",
  },
] as const;

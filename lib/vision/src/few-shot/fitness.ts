/**
 * FITNESS few-shot examples for the Bedrock Nova Lite adapter.
 *
 * See `./setups.ts` for the slop-detector contract every example must
 * satisfy. The build-time sanity test re-runs `detectSlop` against
 * every example so future edits cannot ship a banned-word or
 * malformed line into the system prompt.
 */

import type { FewShotExample } from "./types.js";

export const FITNESS_FEW_SHOT: readonly FewShotExample[] = [
  {
    scene: "Athlete mid-deadlift with chalked hands and bent barbell.",
    imageNouns: ["barbell", "chalk", "platform"],
    commentary:
      "That barbell bends under disciplined intent; the platform groans, refuses to argue.",
  },
  {
    scene: "Runner sprinting through a coastal road at dawn.",
    imageNouns: ["runner", "road", "sunrise"],
    commentary:
      "The runner devours the road; sunrise barely keeps pace with that stride.",
  },
  {
    scene: "Boxer drilling combinations on a heavy bag in a dim gym.",
    imageNouns: ["boxer", "bag", "gloves"],
    commentary:
      "Each combination rearranges the bag; the boxer hunts something only gloves can answer.",
  },
  {
    scene: "Casual gym selfie with an empty barbell and a phone propped up.",
    imageNouns: ["barbell", "phone", "mirror"],
    commentary:
      "Empty barbell, phone tilted, mirror lit; the work has not begun yet.",
  },
  {
    scene: "Powerlifter locking out a heavy squat with a packed rack.",
    imageNouns: ["squat", "rack", "plates"],
    commentary:
      "The rack braces against that squat; plates announce the lifter outranks them.",
  },
  {
    scene: "Yogi holding a one-arm balance on a sun-drenched mat.",
    imageNouns: ["yogi", "mat", "sunlight"],
    commentary:
      "The yogi turns gravity into negotiation; the mat agrees to nothing else.",
  },
  {
    scene: "Climber halfway up a basalt wall with chalked fingers.",
    imageNouns: ["climber", "wall", "chalk"],
    commentary:
      "The wall surrenders one hold at a time; that climber is collecting taxes.",
  },
  {
    scene: "Cyclist mid-climb on a switchback gradient with sun beating down.",
    imageNouns: ["cyclist", "road", "bike"],
    commentary:
      "The cyclist drags the bike up that road as if punishing the gradient.",
  },
  {
    scene: "Empty squat rack with neatly racked dumbbells in the background.",
    imageNouns: ["rack", "dumbbells", "gym"],
    commentary:
      "The rack waits politely; this gym hides its menace until someone clocks in.",
  },
  {
    scene: "Strongman flipping a tractor tire on a chalk-streaked floor.",
    imageNouns: ["tire", "strongman", "chalk"],
    commentary:
      "That tire forgets its weight class the moment the strongman commits to chalk.",
  },
  {
    scene: "Swimmer pushing off the wall in lane four mid-stroke.",
    imageNouns: ["swimmer", "lane", "pool"],
    commentary:
      "The swimmer treats lane four like territory; this pool keeps no secrets.",
  },
  {
    scene: "Kettlebell circuit setup with chalk dust and a heart-rate monitor.",
    imageNouns: ["kettlebell", "chalk", "monitor"],
    commentary:
      "That kettlebell knows the chalk; the monitor will read war by round three.",
  },
] as const;

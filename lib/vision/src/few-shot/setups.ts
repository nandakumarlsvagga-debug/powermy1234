/**
 * SETUPS few-shot examples for the Bedrock Nova Lite adapter.
 *
 * The Vision Adapter renders a 12–20 example block per Category into
 * the system prompt at call time so the model anchors on POWERLVL's
 * brand tone (Requirement 5.4). Every example below satisfies the
 * slop-detector contract (Requirement 5.5):
 *
 *   - commentary word count ∈ [8, 14]
 *   - commentary references at least one `imageNouns` entry as a
 *     whole word (case-insensitive)
 *   - commentary contains no banned word from `BANNED_WORDS`
 *
 * The build-time sanity test in `test/few-shot.spec.ts` re-runs the
 * slop detector against every example so a future edit cannot
 * accidentally introduce a banned word or a malformed line.
 */

import type { FewShotExample } from "./types.js";

export const SETUPS_FEW_SHOT: readonly FewShotExample[] = [
  {
    scene: "Triple ultrawide rig with chromatic RGB and a tower workstation.",
    imageNouns: ["monitors", "tower", "rgb", "desk"],
    commentary:
      "Triple monitors radiate sovereign discipline; this tower runs cold and hunts.",
  },
  {
    scene: "Mechanical keyboard with custom keycaps under a single warm lamp.",
    imageNouns: ["keyboard", "keycaps", "lamp"],
    commentary:
      "Custom keycaps glow under that lamp; this keyboard answers only to its operator.",
  },
  {
    scene: "Curved gaming monitor flanked by cable-managed peripherals.",
    imageNouns: ["monitor", "cables", "mouse", "headset"],
    commentary:
      "That curved monitor surveys the desk while the cables stay invisible by command.",
  },
  {
    scene: "Battlestation drowning in tangled wires and dust on the desk.",
    imageNouns: ["wires", "dust", "desk"],
    commentary:
      "These wires confess the desk has not seen discipline in many seasons.",
  },
  {
    scene: "Minimalist white desk with one screen, one keyboard, one notebook.",
    imageNouns: ["desk", "screen", "notebook"],
    commentary:
      "One screen, one notebook, one quiet desk; the operator wastes nothing visible.",
  },
  {
    scene: "Open PC tower with hardline water cooling and matched fans.",
    imageNouns: ["tower", "tubes", "fans", "radiator"],
    commentary:
      "Hardline tubes lock that tower into a closed loop; radiator hums under load.",
  },
  {
    scene: "Vintage CRT monitor on a wood desk beside a beige tower.",
    imageNouns: ["crt", "tower", "desk"],
    commentary:
      "The CRT refuses retirement; that beige tower still throws weight around the desk.",
  },
  {
    scene: "Pristine cable-managed setup with a single wide monitor floating.",
    imageNouns: ["monitor", "cables", "stand"],
    commentary:
      "The monitor floats above hidden cables; this stand answers to a careful operator.",
  },
  {
    scene: "Dual-monitor coding setup with a docked laptop and a thermal mug.",
    imageNouns: ["laptop", "monitors", "mug"],
    commentary:
      "Laptop docked, monitors aligned, the mug runs second shift with the operator.",
  },
  {
    scene: "RGB rig with mismatched colors flickering across acrylic panels.",
    imageNouns: ["rgb", "panels", "rig"],
    commentary:
      "RGB drifts across the panels; this rig wants attention more than discipline.",
  },
  {
    scene: "Compact ITX build mounted under a glass desk with a tablet.",
    imageNouns: ["itx", "desk", "tablet"],
    commentary:
      "That ITX build punches above its volume; the desk barely registers its presence.",
  },
  {
    scene: "Dual-monitor work desk with a leather chair and analog clock.",
    imageNouns: ["chair", "monitors", "clock"],
    commentary:
      "Leather chair, paired monitors, clock keeping watch; this desk is built for hours.",
  },
] as const;

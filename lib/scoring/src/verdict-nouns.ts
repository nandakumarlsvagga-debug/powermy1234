import crypto from "crypto";
import type { Tier, CulturalReading, VerdictFlavor } from "./types.js";
import { mulberry32 } from "./prng.js";

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export const VERDICT_NOUNS: Record<Tier, Record<VerdictFlavor, string[]>> = {
  D: {
    default: ["Dormant Signal", "Faint Trace", "Background Noise", "Low Pulse", "Dim Frequency"],
    menace: ["Cold Static", "Dead Channel", "Null Threat"],
    absurdity: ["Confused Signal", "Garbled Ping", "Lost Packet"],
    wholesome: ["Gentle Murmur", "Quiet Hum", "Soft Ping"],
    pretension: ["Empty Flex", "Hollow Signal", "Vapor Trace"],
    meme: ["Dead Meme", "Stale Format", "Expired Template"],
    iconic: ["Fallen Icon", "Stripped Signal"],
  },
  C: {
    default: ["Stable Frequency", "Mid Signal", "Passive Trace", "Warm Ping", "Fading Echo"],
    menace: ["Dull Edge", "Blunt Force", "Smolder"],
    absurdity: ["Odd Frequency", "Static Burst", "Glitch Pulse"],
    wholesome: ["Steady Glow", "Warm Current", "Calm Pulse"],
    pretension: ["Strained Signal", "Forced Frequency"],
    meme: ["Echo Format", "Circulated Template"],
    iconic: ["Known Signal", "Recognized Trace"],
  },
  B: {
    default: ["Rising Signal", "Active Frequency", "Strong Trace", "Charged Ping", "Building Wave"],
    menace: ["Sharp Edge", "Gathering Storm", "Coiled Threat"],
    absurdity: ["Wild Frequency", "Chaotic Pulse", "Rogue Signal"],
    wholesome: ["Bright Current", "Pure Frequency", "Golden Pulse"],
    pretension: ["Polished Signal", "Curated Trace"],
    meme: ["Live Format", "Active Template", "Fresh Signal"],
    iconic: ["Known Presence", "Established Signal"],
  },
  A: {
    default: ["Dominant Signal", "Peak Frequency", "Command Trace", "Locked Pulse", "Heavy Wave"],
    menace: ["Apex Predator", "Cold Authority", "Silent Threat"],
    absurdity: ["Maximum Chaos", "Unhinged Pulse", "Feral Signal"],
    wholesome: ["Radiant Core", "Sacred Frequency", "Guardian Pulse"],
    pretension: ["Polished Authority", "Crafted Signal"],
    meme: ["Viral Format", "Dominant Template"],
    iconic: ["Cultural Anchor", "Canon Signal"],
  },
  S: {
    default: ["Elite Signal", "Sovereign Pulse", "Prime Frequency", "Apex Trace", "Titan Wave"],
    menace: ["Final Warning", "Extinction Signal", "Absolute Threat"],
    absurdity: ["Reality Break", "Dimension Rift", "Uncharted Chaos"],
    wholesome: ["Divine Frequency", "Celestial Pulse", "Eternal Warmth"],
    pretension: ["Grand Architect", "Master Signal"],
    meme: ["Legendary Format", "Immortal Template"],
    iconic: ["Living Legend", "Crowned Signal", "Sovereign Icon"],
  },
  SS: {
    default: ["Mythic Signal", "Forbidden Frequency", "Omega Trace", "Transcendent Pulse"],
    menace: ["Omega Threat", "Cataclysm Signal", "World Ender"],
    absurdity: ["Beyond Measurement", "Paradox Signal", "Rift Walker"],
    wholesome: ["Eternal Light", "Celestial Core", "Divine Radiance"],
    pretension: ["Architect Supreme", "Infinite Craft"],
    meme: ["Eternal Format", "Undying Template", "Canon Meme"],
    iconic: ["Timeless Icon", "Eternal Canon", "Cultural Monument"],
  },
  SSS: {
    default: ["Singularity", "Absolute Signal", "Prime Directive", "Omega Frequency"],
    menace: ["Extinction Event", "Final Frequency", "Absolute Zero"],
    absurdity: ["Reality Collapse", "Dimensional Tear", "Impossible Signal"],
    wholesome: ["Sacred Flame", "Infinite Grace", "Divine Mandate"],
    pretension: ["Supreme Architect"],
    meme: ["Permanent Canon", "Civilization Artifact"],
    iconic: ["Living Monument", "Civilization Peak", "Eternal Artifact"],
  },
  LIMITLESS: {
    default: ["LIMITLESS", "Beyond Measurement", "Off The Scale"],
    menace: ["LIMITLESS"],
    absurdity: ["LIMITLESS"],
    wholesome: ["LIMITLESS"],
    pretension: ["LIMITLESS"],
    meme: ["LIMITLESS"],
    iconic: ["LIMITLESS"],
  },
};

export function dominantFlavor(reading: CulturalReading): VerdictFlavor {
  const signals = {
    menace: reading.menace_level,
    absurdity: reading.absurdity_level,
    wholesome: reading.wholesomeness_level,
    pretension: reading.pretension_level,
    meme: reading.memetic_status !== "non_meme" ? 8 : 0,
    iconic: reading.subject_class === "iconic" ? 9 : 0,
  };
  const max = Math.max(...Object.values(signals));
  if (max <= 3) return "default";
  
  for (const [key, val] of Object.entries(signals)) {
    if (val === max) return key as VerdictFlavor;
  }
  return "default";
}

export function pickVerdictNoun(tier: Tier, reading: CulturalReading, scanId: string): string {
  const flavor = dominantFlavor(reading);
  const pool = VERDICT_NOUNS[tier][flavor] ?? VERDICT_NOUNS[tier].default;
  const seed = sha256(`${scanId}|${tier}|${flavor}`);
  // mulberry32 returns a float in [0, 1), multiplying by pool.length and using bitwise OR to floor.
  const rngVal = mulberry32(parseInt(seed.slice(0, 8), 16))();
  const idx = (rngVal * pool.length) | 0;
  return pool[idx] ?? pool[0]!;
}

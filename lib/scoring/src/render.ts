import type { Tier, CulturalReading, RenderedScore, ModifierLog, Category, CoreStats, CategoryStats } from "./types.js";
import { pickVerdictNoun } from "./verdict-nouns.js";

const ARCHETYPE_TO_CATEGORY: Record<string, Category> = {
  // SETUPS
  minimalist_monk: "SETUPS",
  operator_command: "SETUPS",
  cinematic_creator: "SETUPS",
  custom_loop_war: "SETUPS",
  vintage_legend: "SETUPS",
  rgb_rainbow_rave: "SETUPS",
  dorm_first_attempt: "SETUPS",
  kitchen_table_remote: "SETUPS",
  showroom_wallpaper: "SETUPS",

  // FITNESS
  championship_form: "FITNESS",
  disciplined_amateur: "FITNESS",
  first_session_earnest: "FITNESS",
  mirror_flex_phone: "FITNESS",
  performative_lite: "FITNESS",
  yoga_meditative: "FITNESS",
  combat_practitioner: "FITNESS",
  outdoor_endurance: "FITNESS",
  rehabilitation: "FITNESS",

  // DRIP
  archive_grail: "DRIP",
  simple_done_right: "DRIP",
  subculture_thesis: "DRIP",
  logo_stack: "DRIP",
  mall_aspirational: "DRIP",
  thrift_remix: "DRIP",
  cultural_traditional: "DRIP",
  wedding_or_event: "DRIP",
  first_outfit_post: "DRIP",

  // PETS
  doge_lineage: "PETS",
  menace_real: "PETS",
  divine_regal: "PETS",
  goblin_chaos: "PETS",
  scholar_brain: "PETS",
  senior_dignified: "PETS",
  coerced_costume: "PETS",
  earnest_companion: "PETS",
  rescued_or_distress: "PETS",

  // RIDES
  hypercar_grail: "RIDES",
  enthusiast_legend: "RIDES",
  muscle_threat: "RIDES",
  stock_immaculate: "RIDES",
  beater_loved: "RIDES",
  ricer_excess: "RIDES",
  vintage_european: "RIDES",
  first_car_earnest: "RIDES",

  // WILDCARD
  religious_iconic: "WILDCARD",
  internet_canon_meme: "WILDCARD",
  historical_artifact: "WILDCARD",
  cryptid_mystery: "WILDCARD",
  everyday_dignity: "WILDCARD",
  mona_lisa_tier: "WILDCARD",
  sacred_memorial: "WILDCARD",
  personal_artifact: "WILDCARD",
  trash_as_profundity: "WILDCARD",
};

function computeBaseScore(reading: CulturalReading): number {
  const blended = 0.65 * reading.taste_demonstrated_score + 0.35 * reading.cultural_recognition_score;
  const normalized = blended / 100;
  const eased = Math.pow(normalized, 1.45);
  return Math.round(1000 + eased * 99000);
}

function scoreToTier(score: number): Tier {
  if (score <= 4999) return "D";
  if (score <= 14999) return "C";
  if (score <= 34999) return "B";
  if (score <= 54999) return "A";
  if (score <= 74999) return "S";
  if (score <= 89999) return "SS";
  if (score <= 98999) return "SSS";
  return "LIMITLESS";
}

function signalToStat(value: number, scale: number = 100): number {
  const norm = value / scale;
  const eased = Math.pow(norm, 1.3);
  return Math.round(eased * 10000);
}

export function renderScore(reading: CulturalReading, scanId: string, explicitCategory?: Category): RenderedScore {
  const scorePreModifiers = computeBaseScore(reading);
  let score = scorePreModifiers;
  const modifiersApplied: ModifierLog[] = [];

  const logModifier = (
    name: string,
    condition: string,
    action: ModifierLog["action"],
    scoreBefore: number,
    scoreAfter: number
  ) => {
    if (scoreAfter !== scoreBefore) {
      modifiersApplied.push({ name, condition, action, scoreBefore, scoreAfter });
    }
  };

  // 1. ANTI-ICONIC CEILING
  const before1 = score;
  if (reading.subject_class === "anti_iconic") {
    score = Math.min(score, 4999);
    logModifier(
      "anti-iconic ceiling",
      'subjectClass == "anti_iconic"',
      "ceiling",
      before1,
      score
    );
  }

  // 2. SATIRICAL-INVERSION FLOOR
  const before2 = score;
  if (reading.subject_class === "satirical_inversion" && reading.joke_target === "the_powerful") {
    score = Math.max(score, 55000);
    logModifier(
      "satirical-inversion floor",
      'subjectClass == "satirical_inversion" AND jokeTarget == "the_powerful"',
      "floor",
      before2,
      score
    );
  }

  // 3. REVERENCE-PROTECTED FLOOR
  const before3 = score;
  if (
    reading.subject_class === "reverence_protected" ||
    reading.subject_class === "sacred_or_memorial" ||
    reading.subject_class === "first_attempt_earnest"
  ) {
    score = Math.max(score, 15000);
    logModifier(
      "reverence-protected floor",
      'subjectClass IN ("reverence_protected", "sacred_or_memorial", "first_attempt_earnest")',
      "floor",
      before3,
      score
    );
  }

  // 4. ICONIC FLOOR
  const before4 = score;
  if (reading.subject_class === "iconic") {
    score = Math.max(score, 55000);
    logModifier(
      "iconic floor",
      'subjectClass == "iconic"',
      "floor",
      before4,
      score
    );
  }

  // 5. ICONIC-MEME FLOOR
  const before5 = score;
  if (
    reading.subject_class === "iconic" &&
    (reading.memetic_status === "iconic_template" || reading.memetic_status === "fresh_meme")
  ) {
    score = Math.max(score, 75000);
    logModifier(
      "iconic-meme floor",
      'subjectClass == "iconic" AND memeticStatus IN ("iconic_template", "fresh_meme")',
      "floor",
      before5,
      score
    );
  }

  // 6. POWERLVL BRAND PULL + CAP
  const before6 = score;
  if (reading.powerlvl_brand_visible && reading.subject_class !== "anti_iconic") {
    score = Math.round(score + (62500 - score) * 0.30);
    score = Math.min(score, 74999);
    logModifier(
      "POWERLVL brand pull + cap",
      "powerlvlBrandVisible == true",
      "pull",
      before6,
      score
    );
  }

  // 7. TASTE-BRAND BONUS + CAP
  const before7 = score;
  if (
    reading.taste_brands_visible &&
    reading.taste_brands_visible.length >= 1 &&
    (reading.subject_class === "mid" || reading.subject_class === "trying_too_hard")
  ) {
    const bonus = 1500 * reading.taste_brands_visible.length;
    let limit = Math.max(54999, scorePreModifiers);
    if (reading.powerlvl_brand_visible) {
      limit = Math.min(limit, 74999);
    }
    score = Math.min(score + bonus, limit);
    logModifier(
      "taste-brand bonus + cap",
      'tasteBrandsVisible.length >= 1 AND subjectClass IN ("mid", "trying_too_hard")',
      "bonus",
      before7,
      score
    );
  }

  // 8. PRETENSION PENALTY
  const before8 = score;
  if (
    reading.pretension_level * 10 >= 70 &&
    (reading.subject_class === "trying_too_hard" || reading.subject_class === "mid")
  ) {
    score = Math.min(score, 19999);
    logModifier(
      "pretension penalty",
      'pretension >= 70 AND subjectClass IN ("trying_too_hard", "mid")',
      "penalty",
      before8,
      score
    );
  }

  // 9. SELF-AWARE AFFECTION
  const before9 = score;
  if (reading.joke_target === "self_aware" && reading.subject_class !== "anti_iconic") {
    score = Math.max(score, 15000);
    if (reading.subject_class !== "iconic") {
      score = Math.min(score, 74999);
    }
    logModifier(
      "self-aware affection",
      'jokeTarget == "self_aware"',
      "bonus",
      before9,
      score
    );
  }

  // 10. OUT-OF-SCOPE CAP
  const before10 = score;
  if (reading.category_match_score <= 2) {
    score = Math.min(score, 14999);
    logModifier(
      "out-of-scope cap",
      "categoryMatchScore <= 2",
      "ceiling",
      before10,
      score
    );
  }

  // 11. FINAL CLAMP
  score = Math.max(1000, Math.min(100000, score));

  // Step 3: Tier Derivation
  let tier = scoreToTier(score);

  // Step 4: LIMITLESS Gate
  if (tier === "LIMITLESS" && !(reading.subject_class === "iconic" && reading.cultural_recognition_score >= 95)) {
    score = 98999;
    tier = "SSS";
  }

  // Step 5: Core Stats Derivation
  const aura = signalToStat(
    0.5 * reading.taste_demonstrated_score +
      0.3 * reading.wholesomeness_level * 10 +
      0.2 * reading.sincerity_level * 10
  );
  const power = signalToStat(
    0.4 * reading.cultural_recognition_score +
      0.3 * reading.menace_level * 10 +
      0.3 * reading.taste_demonstrated_score
  );
  const status = signalToStat(
    0.5 * reading.cultural_recognition_score +
      0.3 * reading.taste_demonstrated_score +
      0.2 * reading.sincerity_level * 10
  );
  const threat = signalToStat(
    0.4 * reading.menace_level * 10 +
      0.3 * reading.absurdity_level * 10 +
      0.3 * reading.cultural_recognition_score
  );

  const coreStats: CoreStats = { aura, power, status, threat };

  // Determine category
  const category = explicitCategory ?? ARCHETYPE_TO_CATEGORY[reading.archetype] ?? "WILDCARD";

  // Per-Category Stats Derivation
  const categoryStats: CategoryStats = {};
  const tD = reading.taste_demonstrated_score;
  const cR = reading.cultural_recognition_score;
  const mL = reading.menace_level * 10;
  const sL = reading.sincerity_level * 10;
  const aL = reading.absurdity_level * 10;
  const wL = reading.wholesomeness_level * 10;
  const pL = reading.pretension_level * 10;

  if (category === "SETUPS") {
    categoryStats["Processing Power"] = signalToStat(0.6 * tD + 0.4 * mL);
    categoryStats["Lock-In Rate"] = signalToStat(0.5 * sL + 0.5 * tD);
    categoryStats["Build Quality"] = signalToStat(0.7 * tD + 0.3 * cR);
    categoryStats["Threat Output"] = signalToStat(0.5 * mL + 0.3 * aL + 0.2 * tD);
    categoryStats["RGB Stability"] = signalToStat(100 - pL);
  } else if (category === "FITNESS") {
    categoryStats["Power Output"] = signalToStat(0.5 * mL + 0.5 * tD);
    categoryStats["Discipline Index"] = signalToStat(0.6 * sL + 0.4 * tD);
    categoryStats["Stamina Core"] = signalToStat(0.5 * tD + 0.3 * cR + 0.2 * sL);
    categoryStats["Aura Level"] = signalToStat(0.5 * wL + 0.3 * tD + 0.2 * cR);
    categoryStats["Threat Rating"] = signalToStat(0.5 * mL + 0.3 * cR + 0.2 * aL);
  } else if (category === "DRIP") {
    categoryStats["Rizz Level"] = signalToStat(0.5 * tD + 0.3 * cR + 0.2 * sL);
    categoryStats["Style Sync"] = signalToStat(0.6 * tD + 0.4 * cR);
    categoryStats["Flex Value"] = signalToStat(0.4 * cR + 0.3 * tD + 0.3 * mL);
    categoryStats["Trend Energy"] = signalToStat(0.5 * cR + 0.3 * aL + 0.2 * tD);
    categoryStats["Aura Output"] = signalToStat(0.5 * tD + 0.3 * wL + 0.2 * sL);
  } else if (category === "PETS") {
    categoryStats["Menace Level"] = signalToStat(0.6 * mL + 0.4 * aL);
    categoryStats["Chaos Index"] = signalToStat(0.5 * aL + 0.3 * mL + 0.2 * wL);
    categoryStats["Divine Energy"] = signalToStat(0.5 * wL + 0.3 * sL + 0.2 * cR);
    categoryStats["Brain Activity"] = signalToStat(0.4 * aL + 0.3 * mL + 0.3 * sL);
    categoryStats["Aura Output"] = signalToStat(0.5 * tD + 0.3 * cR + 0.2 * wL);
  } else if (category === "RIDES") {
    categoryStats["Horsepower Aura"] = signalToStat(0.5 * mL + 0.3 * tD + 0.2 * cR);
    categoryStats["Dominance Output"] = signalToStat(0.5 * cR + 0.3 * mL + 0.2 * tD);
    categoryStats["Street Presence"] = signalToStat(0.4 * tD + 0.3 * cR + 0.3 * mL);
    categoryStats["Threat Level"] = signalToStat(0.5 * mL + 0.3 * aL + 0.2 * cR);
    categoryStats["Engine Energy"] = signalToStat(0.5 * tD + 0.3 * mL + 0.2 * sL);
  } else {
    // WILDCARD
    categoryStats["Mystery Factor"] = signalToStat(0.4 * aL + 0.3 * cR + 0.3 * mL);
    categoryStats["Aura Output"] = signalToStat(0.5 * tD + 0.3 * cR + 0.2 * wL);
    categoryStats["Chaos Index"] = signalToStat(0.5 * aL + 0.3 * mL + 0.2 * pL);
    categoryStats["Rarity Score"] = signalToStat(0.6 * cR + 0.4 * tD);
    categoryStats["Energy Signature"] = signalToStat(0.4 * mL + 0.3 * sL + 0.3 * tD);
  }

  // Step 6: Verdict Noun Selection
  const verdictNoun = pickVerdictNoun(tier, reading, scanId);

  return {
    score,
    tier,
    verdictNoun,
    coreStats,
    categoryStats,
    modifiersApplied,
    scorePreModifiers,
  };
}

import { describe, it, expect } from "vitest";
import { renderScore } from "../src/render.js";
import type { CulturalReading } from "../src/types.js";

/**
 * Canonical anchor tests — A-1 through A-17.
 * CI MUST FAIL if any anchor regresses (tasks.md 2.8, Requirement 6.8).
 * These anchors represent the cultural reputation of POWERLVL.
 */

const ANCHOR_SCAN_ID = "anchor-test-scan-00000001";

function makeReading(overrides: Partial<CulturalReading>): CulturalReading {
  return {
    image_subjects: ["subject"],
    archetype: "mid",
    subject_class: "mid",
    joke_target: "none",
    memetic_status: "non_meme",
    taste_demonstrated_score: 50,
    cultural_recognition_score: 50,
    absurdity_level: 3,
    sincerity_level: 5,
    pretension_level: 2,
    menace_level: 3,
    wholesomeness_level: 5,
    powerlvl_brand_visible: false,
    taste_brands_visible: [],
    category_match_score: 7,
    anomaly_signal: null,
    cultural_notes: "",
    ...overrides,
  };
}

describe("Canonical Anchor Tests — Cultural Reputation Gate", () => {
  it("A-1: Mona Lisa — score ≥ SS (75000)", () => {
    const reading = makeReading({
      image_subjects: ["mona_lisa", "painting"],
      archetype: "mona_lisa_tier",
      subject_class: "iconic",
      memetic_status: "iconic_template",
      taste_demonstrated_score: 98,
      cultural_recognition_score: 99,
      menace_level: 3,
      wholesomeness_level: 8,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeGreaterThanOrEqual(75000);
  });

  it("A-2: Doge meme — score ≥ SS (75000)", () => {
    const reading = makeReading({
      image_subjects: ["shiba_inu", "doge"],
      archetype: "doge_lineage",
      subject_class: "iconic",
      memetic_status: "iconic_template",
      taste_demonstrated_score: 85,
      cultural_recognition_score: 97,
      absurdity_level: 9,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "PETS");
    expect(result.score).toBeGreaterThanOrEqual(75000);
  });

  it("A-3: Spider-Man pointing meme — score ≥ SS (75000)", () => {
    const reading = makeReading({
      image_subjects: ["spider_man", "pointing"],
      archetype: "internet_canon_meme",
      subject_class: "iconic",
      memetic_status: "iconic_template",
      taste_demonstrated_score: 80,
      cultural_recognition_score: 96,
      absurdity_level: 8,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeGreaterThanOrEqual(75000);
  });

  it("A-4: McLaren F1 — score ≥ S (55000)", () => {
    const reading = makeReading({
      image_subjects: ["mclaren_f1", "supercar"],
      archetype: "hypercar_grail",
      subject_class: "iconic",
      memetic_status: "non_meme",
      taste_demonstrated_score: 95,
      cultural_recognition_score: 96,
      menace_level: 9,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "RIDES");
    expect(result.score).toBeGreaterThanOrEqual(55000);
  });

  it("A-5: Champion bodybuilder — score ≥ S (55000)", () => {
    const reading = makeReading({
      image_subjects: ["bodybuilder", "physique"],
      archetype: "championship_form",
      subject_class: "iconic",
      memetic_status: "non_meme",
      taste_demonstrated_score: 90,
      cultural_recognition_score: 88,
      menace_level: 10,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "FITNESS");
    expect(result.score).toBeGreaterThanOrEqual(55000);
  });

  it("A-6: Religious icon — score ≥ S (55000)", () => {
    const reading = makeReading({
      image_subjects: ["religious_icon", "sacred"],
      archetype: "religious_iconic",
      subject_class: "iconic",
      memetic_status: "non_meme",
      taste_demonstrated_score: 85,
      cultural_recognition_score: 90,
      wholesomeness_level: 9,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeGreaterThanOrEqual(55000);
  });

  it("A-7: Kim Jong Un in frock (satirical inversion) — score ≥ S (55000)", () => {
    const reading = makeReading({
      image_subjects: ["kim_jong_un", "frock"],
      archetype: "cryptid_mystery",
      subject_class: "satirical_inversion",
      joke_target: "the_powerful",
      memetic_status: "fresh_meme",
      taste_demonstrated_score: 70,
      cultural_recognition_score: 85,
      absurdity_level: 9,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeGreaterThanOrEqual(55000);
  });

  it("A-8: Plain Kim Jong Un (anti-iconic) — score ≤ 4999 (D tier)", () => {
    const reading = makeReading({
      image_subjects: ["kim_jong_un"],
      archetype: "cryptid_mystery",
      subject_class: "anti_iconic",
      joke_target: "none",
      memetic_status: "non_meme",
      taste_demonstrated_score: 20,
      cultural_recognition_score: 40,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeLessThanOrEqual(4999);
  });

  it("A-9: Terrorist glorification (anti-iconic) — score = D (≤ 4999)", () => {
    const reading = makeReading({
      image_subjects: ["weapon", "extremist"],
      archetype: "cryptid_mystery",
      subject_class: "anti_iconic",
      joke_target: "the_vulnerable",
      taste_demonstrated_score: 5,
      cultural_recognition_score: 15,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeLessThanOrEqual(4999);
  });

  it("A-10: Kid drawing (reverence_protected) — score ≥ B (15000)", () => {
    const reading = makeReading({
      image_subjects: ["drawing", "child_art"],
      archetype: "dorm_first_attempt",
      subject_class: "first_attempt_earnest",
      taste_demonstrated_score: 30,
      cultural_recognition_score: 20,
      wholesomeness_level: 9,
      sincerity_level: 10,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeGreaterThanOrEqual(15000);
  });

  it("A-11: First dorm setup (reverence_protected) — score ≥ B (15000)", () => {
    const reading = makeReading({
      image_subjects: ["desk", "dorm", "monitor"],
      archetype: "dorm_first_attempt",
      subject_class: "first_attempt_earnest",
      taste_demonstrated_score: 35,
      cultural_recognition_score: 25,
      wholesomeness_level: 8,
      sincerity_level: 9,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "SETUPS");
    expect(result.score).toBeGreaterThanOrEqual(15000);
  });

  it("A-12: Mall drip — score ≤ C+ (14999)", () => {
    const reading = makeReading({
      image_subjects: ["hoodie", "sneakers"],
      archetype: "mall_aspirational",
      subject_class: "trying_too_hard",
      pretension_level: 8,
      taste_demonstrated_score: 25,
      cultural_recognition_score: 15,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "DRIP");
    // pretension ≥ 70 + trying_too_hard → cap at 19999, but base should be low
    expect(result.score).toBeLessThanOrEqual(19999);
  });

  it("A-13: Ricer Civic — score ≤ C+ (19999)", () => {
    const reading = makeReading({
      image_subjects: ["honda_civic", "body_kit", "spoiler"],
      archetype: "ricer_excess",
      subject_class: "trying_too_hard",
      pretension_level: 8,
      taste_demonstrated_score: 20,
      cultural_recognition_score: 18,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "RIDES");
    expect(result.score).toBeLessThanOrEqual(19999);
  });

  it("A-14: Coffee mug in nice light — score ∈ [B, A] (15000..54999)", () => {
    const reading = makeReading({
      image_subjects: ["mug", "coffee", "light"],
      archetype: "personal_artifact",
      subject_class: "mid",
      taste_demonstrated_score: 60,
      cultural_recognition_score: 45,
      sincerity_level: 7,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "WILDCARD");
    expect(result.score).toBeGreaterThanOrEqual(15000);
    expect(result.score).toBeLessThanOrEqual(54999);
  });

  it("A-15: POWERLVL sticker on mid setup — score ∈ [A, S] AND < LIMITLESS", () => {
    const reading = makeReading({
      image_subjects: ["desk", "monitor", "powerlvl_sticker"],
      archetype: "kitchen_table_remote",
      subject_class: "mid",
      powerlvl_brand_visible: true,
      taste_demonstrated_score: 55,
      cultural_recognition_score: 50,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "SETUPS");
    // POWERLVL brand pulls toward S and caps at 74999
    expect(result.score).toBeLessThanOrEqual(74999);
    expect(result.score).toBeGreaterThanOrEqual(35000);
    expect(result.tier).not.toBe("LIMITLESS");
  });

  it("A-16: Margiela coat fit — score ≥ S (55000)", () => {
    const reading = makeReading({
      image_subjects: ["coat", "margiela"],
      archetype: "archive_grail",
      subject_class: "iconic",
      taste_brands_visible: ["margiela"],
      memetic_status: "non_meme",
      taste_demonstrated_score: 95,
      cultural_recognition_score: 90,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "DRIP");
    expect(result.score).toBeGreaterThanOrEqual(55000);
  });

  it("A-17: Mac Pro setup with HHKB — score ≥ S (55000)", () => {
    const reading = makeReading({
      image_subjects: ["mac_pro", "hhkb", "desk"],
      archetype: "operator_command",
      subject_class: "iconic",
      taste_brands_visible: ["hhkb"],
      memetic_status: "non_meme",
      taste_demonstrated_score: 92,
      cultural_recognition_score: 88,
      menace_level: 7,
    });
    const result = renderScore(reading, ANCHOR_SCAN_ID, "SETUPS");
    expect(result.score).toBeGreaterThanOrEqual(55000);
  });
});

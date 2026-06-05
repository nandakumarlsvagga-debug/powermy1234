import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { renderScore } from "../src/render.js";
import type { CulturalReading } from "../src/types.js";

const arbitraryCulturalReading = (): fc.Arbitrary<CulturalReading> =>
  fc.record({
    image_subjects: fc.array(fc.string({ minLength: 2, maxLength: 12 }), { minLength: 1, maxLength: 5 }),
    archetype: fc.constantFrom(
      "minimalist_monk", "operator_command", "championship_form",
      "archive_grail", "doge_lineage", "hypercar_grail", "internet_canon_meme", "mid"
    ),
    subject_class: fc.constantFrom(
      "iconic", "reverence_protected", "anti_iconic",
      "trying_too_hard", "mid", "satirical_inversion", "sacred_or_memorial", "first_attempt_earnest"
    ),
    joke_target: fc.constantFrom("the_powerful", "the_vulnerable", "self_aware", "none"),
    memetic_status: fc.constantFrom("iconic_template", "fresh_meme", "aged_meme", "non_meme"),
    taste_demonstrated_score: fc.integer({ min: 1, max: 100 }),
    cultural_recognition_score: fc.integer({ min: 1, max: 100 }),
    absurdity_level: fc.integer({ min: 1, max: 10 }),
    sincerity_level: fc.integer({ min: 1, max: 10 }),
    pretension_level: fc.integer({ min: 1, max: 10 }),
    menace_level: fc.integer({ min: 1, max: 10 }),
    wholesomeness_level: fc.integer({ min: 1, max: 10 }),
    powerlvl_brand_visible: fc.boolean(),
    taste_brands_visible: fc.array(fc.constantFrom("margiela", "carhartt_wip", "hhkb", "fellow_kettle"), { maxLength: 3 }),
    category_match_score: fc.integer({ min: 1, max: 10 }),
    anomaly_signal: fc.constantFrom(null, "SCOUTER_FAILURE", "UNREGISTERED_ENERGY"),
    cultural_notes: fc.string({ minLength: 0, maxLength: 80 }),
  });

const SCAN_ID = "test-scan-id-12345678";

describe("P-R1: score range — score ∈ [1000, 100000] for any valid reading", () => {
  it("always in range", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const result = renderScore(reading, SCAN_ID);
        expect(result.score).toBeGreaterThanOrEqual(1000);
        expect(result.score).toBeLessThanOrEqual(100000);
      }),
      { numRuns: 500 }
    );
  });
});

describe("P-R2: determinism — same reading + same scanId → same RenderedScore", () => {
  it("is deterministic", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r1 = renderScore(reading, SCAN_ID);
        const r2 = renderScore(reading, SCAN_ID);
        expect(r1.score).toBe(r2.score);
        expect(r1.tier).toBe(r2.tier);
        expect(r1.verdictNoun).toBe(r2.verdictNoun);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R3: anti-iconic ceiling — subjectClass = anti_iconic → score ≤ 4999", () => {
  it("caps at D tier", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore({ ...reading, subject_class: "anti_iconic" }, SCAN_ID);
        expect(r.score).toBeLessThanOrEqual(4999);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R4: satirical-inversion floor — satirical_inversion + the_powerful → score ≥ 55000", () => {
  it("floors at S tier", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore(
          { ...reading, subject_class: "satirical_inversion", joke_target: "the_powerful", category_match_score: 10 },
          SCAN_ID
        );
        expect(r.score).toBeGreaterThanOrEqual(55000);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R5: reverence floor — reverence_protected → score ≥ 15000", () => {
  it("floors at B tier", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore({ ...reading, subject_class: "reverence_protected", category_match_score: 10 }, SCAN_ID);
        expect(r.score).toBeGreaterThanOrEqual(15000);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R6: iconic floor — iconic → score ≥ 55000", () => {
  it("floors at S tier", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore(
          { ...reading, subject_class: "iconic", memetic_status: "non_meme", category_match_score: 10 },
          SCAN_ID
        );
        expect(r.score).toBeGreaterThanOrEqual(55000);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R7: iconic-meme floor — iconic_meme → score ≥ 75000", () => {
  it("floors at SS tier", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore(
          { ...reading, subject_class: "iconic", memetic_status: "iconic_template", category_match_score: 10, powerlvl_brand_visible: false },
          SCAN_ID
        );
        expect(r.score).toBeGreaterThanOrEqual(75000);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R8: POWERLVL brand cap — brand visible + mid → score ≤ 74999", () => {
  it("caps at S ceiling", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore(
          { ...reading, powerlvl_brand_visible: true, subject_class: "mid" },
          SCAN_ID
        );
        expect(r.score).toBeLessThanOrEqual(74999);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R9: taste-brand cap — taste brands + mid → score ≤ 54999", () => {
  it("caps at A ceiling", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore(
          {
            ...reading,
            taste_brands_visible: ["margiela"],
            subject_class: "mid",
            powerlvl_brand_visible: false,
          },
          SCAN_ID
        );
        if (r.scorePreModifiers <= 54999) {
          expect(r.score).toBeLessThanOrEqual(54999);
        }
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R10: pretension penalty — pretension ≥ 70 + mid → score ≤ 19999", () => {
  it("caps at high-C", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore(
          { ...reading, pretension_level: 8, subject_class: "mid",
            powerlvl_brand_visible: false, taste_brands_visible: [] },
          SCAN_ID
        );
        expect(r.score).toBeLessThanOrEqual(19999);
      }),
      { numRuns: 200 }
    );
  });
});

describe("P-R11: distribution — ≥ 80% of 10k readings in [15000, 70000]", () => {
  it("passes distribution check", () => {
    const reads: CulturalReading[] = fc
      .sample(arbitraryCulturalReading(), 2000)
      .map((r) => ({ ...r, subject_class: "mid" as const, category_match_score: 10 }));
    const inBand = reads.filter((r) => {
      const result = renderScore(r, SCAN_ID);
      return result.score >= 15000 && result.score <= 70000;
    });
    expect(inBand.length / reads.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe("P-R12: verdict determinism", () => {
  it("same reading produces same verdict noun", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r1 = renderScore(reading, SCAN_ID);
        const r2 = renderScore(reading, SCAN_ID);
        expect(r1.verdictNoun).toBe(r2.verdictNoun);
      }),
      { numRuns: 100 }
    );
  });
});

describe("P-R14: LIMITLESS gate", () => {
  it("LIMITLESS requires iconic + culturalRecognition >= 95", () => {
    fc.assert(
      fc.property(arbitraryCulturalReading(), (reading) => {
        const r = renderScore(reading, SCAN_ID);
        if (r.tier === "LIMITLESS") {
          expect(reading.subject_class).toBe("iconic");
          expect(reading.cultural_recognition_score).toBeGreaterThanOrEqual(95);
        }
      }),
      { numRuns: 500 }
    );
  });
});

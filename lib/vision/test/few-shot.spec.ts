/**
 * Build-time validation for the few-shot example library.
 *
 * Per Requirement 5.4 every Category exposes 12–20 few-shot examples
 * in its system prompt. Per Requirement 5.5 the slop detector rejects
 * commentary that fails the word-count band, references no image
 * noun, or contains a banned word. The few-shot examples MUST satisfy
 * the same rules so the prompt cannot teach the model the exact
 * pattern the slop detector will later reject.
 *
 * This test runs the slop detector against every example in every
 * Category. A regression here means the prompt was edited in a way
 * that would silently degrade live model output.
 */

import { describe, expect, it } from "vitest";

import { FEW_SHOT_EXAMPLES } from "../src/few-shot/index.js";
import { detectSlop } from "../src/slop-detector.js";
import type { Category } from "../src/types.js";

const ALL_CATEGORIES: readonly Category[] = [
  "SETUPS",
  "FITNESS",
  "DRIP",
  "PETS",
  "RIDES",
  "WILDCARD",
];

describe("few-shot examples", () => {
  for (const category of ALL_CATEGORIES) {
    describe(category, () => {
      const examples = FEW_SHOT_EXAMPLES[category];

      it("has 12–20 examples (Requirement 5.4)", () => {
        expect(examples.length).toBeGreaterThanOrEqual(12);
        expect(examples.length).toBeLessThanOrEqual(20);
      });

      it("every example passes the slop detector (Requirement 5.5)", () => {
        for (const ex of examples) {
          const verdict = detectSlop(ex.commentary, ex.imageNouns);
          expect(
            verdict,
            `Slop verdict for ${category} commentary ${JSON.stringify(ex.commentary)}`,
          ).toEqual({ ok: true });
        }
      });

      it("every example provides a non-empty scene and 1–6 image nouns", () => {
        for (const ex of examples) {
          expect(ex.scene.length).toBeGreaterThan(0);
          expect(ex.imageNouns.length).toBeGreaterThanOrEqual(1);
          expect(ex.imageNouns.length).toBeLessThanOrEqual(6);
        }
      });
    });
  }
});

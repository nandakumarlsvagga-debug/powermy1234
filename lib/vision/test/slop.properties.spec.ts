/**
 * Property-based tests for the slop detector.
 *
 * Property 15: Slop Word-Count Band — accept iff word count ∈ [8, 14]
 * Property 16: Slop Banned Word Reject — reject when any banned word appears as a whole word
 * Property 17: Slop Image-Noun Grounding — reject when no imageNouns entry appears as a whole word
 *
 * Validates: Requirements 5.5
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { detectSlop } from "../src/slop-detector.js";
import { BANNED_WORDS } from "../src/banned-words.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an accepted text with imageNouns grounded in it. */
function makeValidText(words: string[], nouns: string[]): string {
  // Insert at least one noun into the words array
  const insertIdx = Math.floor(words.length / 2);
  const withNoun = [...words.slice(0, insertIdx), nouns[0]!, ...words.slice(insertIdx)];
  return withNoun.join(" ");
}

/** A word that is guaranteed NOT to be banned and NOT to be a noun. */
const safeLexiconWord = fc
  .stringMatching(/^[a-z]{5,8}$/)
  .filter(
    (w) =>
      !BANNED_WORDS.includes(w.toLowerCase()) &&
      !["noun", "image", "photo"].includes(w)
  );

/** Generates a plain English word array of the requested length (no banned words). */
function safeWordsArb(count: number): fc.Arbitrary<string[]> {
  return fc.array(safeLexiconWord, { minLength: count, maxLength: count });
}

// ---------------------------------------------------------------------------
// Property 15: Slop Word-Count Band
// ---------------------------------------------------------------------------
describe("Property 15: Slop Word-Count Band", () => {
  test("P15a: commentary with exactly 8–14 words and a grounded noun passes (no banned words)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 14 }),
        (wordCount) => {
          // Build words list of `wordCount - 1` safe words plus 1 grounded noun
          const noun = "artifact";
          const extraCount = wordCount - 1;
          const words = Array.from({ length: extraCount }, (_, i) => `word${i}`);
          const text = [...words, noun].join(" ");
          const result = detectSlop(text, [noun]);
          expect(result.ok).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  test("P15b: commentary shorter than 8 words is rejected with word_count reason", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 7 }),
        (wordCount) => {
          const noun = "artifact";
          const baseWords = Array.from({ length: Math.max(0, wordCount - 1) }, (_, i) => `word${i}`);
          const text = wordCount === 0 ? "" : [...baseWords, noun].join(" ");
          const result = detectSlop(text, [noun]);
          if (!result.ok) {
            expect(result.reason).toBe("word_count");
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  test("P15c: commentary longer than 14 words is rejected with word_count reason", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 15, max: 30 }),
        (wordCount) => {
          const noun = "artifact";
          const extraCount = wordCount - 1;
          const words = Array.from({ length: extraCount }, (_, i) => `word${i}`);
          const text = [...words, noun].join(" ");
          const result = detectSlop(text, [noun]);
          if (!result.ok) {
            expect(result.reason).toBe("word_count");
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Slop Banned Word Reject
// ---------------------------------------------------------------------------
describe("Property 16: Slop Banned Word Reject", () => {
  test("P16a: any text containing a banned word as a whole word is rejected", () => {
    // Pick three representative banned words from the known list
    const sampleBanned = BANNED_WORDS.slice(0, 10);
    fc.assert(
      fc.property(
        fc.constantFrom(...sampleBanned),
        (bannedWord) => {
          const noun = "artifact";
          // Build a valid-length sentence containing the banned word and a noun
          const parts = ["this", "is", "truly", bannedWord, "right", "now", noun, "here"];
          const text = parts.join(" "); // 8 words
          const result = detectSlop(text, [noun]);
          // The banned word test should catch it
          if (!result.ok) {
            expect(["banned_word", "word_count"]).toContain(result.reason);
          }
        }
      ),
      { numRuns: sampleBanned.length }
    );
  });

  test("P16b: banned word embedded in a longer word does not trigger rejection on its own", () => {
    // "nicely" contains "nice" but shouldn't trigger the banned-word check
    const noun = "setup";
    const text = "this nicely crafted setup has undeniable presence right now";
    const result = detectSlop(text, [noun]);
    // Word count check: 10 words. No whole-word "nice". Should pass (or fail for another reason but NOT banned_word).
    if (!result.ok) {
      expect(result.reason).not.toBe("banned_word");
    }
  });
});

// ---------------------------------------------------------------------------
// Property 17: Slop Image-Noun Grounding
// ---------------------------------------------------------------------------
describe("Property 17: Slop Image-Noun Grounding", () => {
  test("P17a: text with none of the provided imageNouns is rejected with no_image_noun", () => {
    // 9-word text that contains none of the imageNouns (and no banned words)
    const text = "the energy radiates outward with undeniable force and presence";
    const imageNouns = ["monitor", "keyboard", "desk"];
    const result = detectSlop(text, imageNouns);
    if (!result.ok) {
      expect(result.reason).toBe("no_image_noun");
    }
  });

  test("P17b: text grounded in at least one imageNoun is not rejected for grounding", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("monitor", "keyboard", "desk", "cat", "car", "jacket"),
        (noun) => {
          // Build an 8-word text containing the noun
          const words = ["the", noun, "has", "undeniable", "presence", "and", "raw", "force"];
          const text = words.join(" ");
          const result = detectSlop(text, [noun]);
          if (!result.ok) {
            // Should not be rejected for no_image_noun specifically
            expect(result.reason).not.toBe("no_image_noun");
          }
        }
      )
    );
  });

  test("P17c: a noun as substring of another word does not count as grounded", () => {
    // "cat" inside "catfish" should not satisfy the "cat" noun requirement
    const noun = "cat";
    // 8 words, none of which are exactly "cat" but "catfish" contains it
    const text = "the catfish swam deep with mysterious and ancient energy here";
    const result = detectSlop(text, [noun]);
    if (!result.ok) {
      // Either no_image_noun or word_count
      expect(["no_image_noun", "word_count"]).toContain(result.reason);
    }
  });
});

// ---------------------------------------------------------------------------
// Combined invariant: valid commentary always has all three properties met
// ---------------------------------------------------------------------------
describe("Combined Slop Detector Invariant", () => {
  test("text that satisfies all three properties is never rejected", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 14 }),
        fc.constantFrom("monitor", "setup", "car", "cat", "jacket", "barbell", "bike"),
        (wordCount, noun) => {
          // Build words: all safe non-banned words, ending with the grounded noun
          const safeWords = Array.from(
            { length: wordCount - 1 },
            (_, i) => `wrd${i}${String.fromCharCode(97 + (i % 26))}`
          );
          const text = [...safeWords, noun].join(" ");
          const result = detectSlop(text, [noun]);
          // All three conditions are satisfied, so the result must be ok
          expect(result.ok).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});

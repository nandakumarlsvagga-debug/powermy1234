/**
 * Slop Detector for POWERLVL Vision Model commentary.
 *
 * Implements Requirement 5.5 and design.md → "Stage 8 — Slop Detector":
 * the model's commentary line is rejected as slop and replaced with a
 * line from the Fallback Commentary Library when ANY of the following
 * fail:
 *
 *   1. Word count is outside the inclusive band `[8, 14]`.
 *   2. Any entry from `BANNED_WORDS` matches as a whole word
 *      (case-insensitive). Whole-word matching means "great" rejects
 *      "looks great." but does NOT reject "ingratiate" or "greatness".
 *   3. No entry from the supplied `imageNouns` array appears as a
 *      whole word in the commentary (case-insensitive). The Vision
 *      Model emits 1–6 image nouns alongside its commentary; the slop
 *      detector requires the commentary to be grounded in at least
 *      one of them so the model cannot drift into generic praise.
 *
 * The detector is pure: same `(commentary, imageNouns)` always yields
 * the same verdict. The orchestrator (task 8.7) is the only caller;
 * it uses the `reason` field on a rejection to pick a fallback line
 * and to record the slop pathway hit at INFO for offline tuning.
 */

import { BANNED_WORDS } from "./banned-words.js";
import type { SlopVerdict } from "./types.js";

/** Inclusive minimum commentary word count. (Requirement 5.5) */
const MIN_WORDS = 8;

/** Inclusive maximum commentary word count. (Requirement 5.5) */
const MAX_WORDS = 14;

/**
 * Escape characters that have meaning inside a regular expression so
 * that an arbitrary string literal can be embedded as a fixed pattern.
 *
 * The `BANNED_WORDS` list is hand-curated and contains only ASCII
 * letters today, but `imageNouns` arrives from the Vision Model and
 * could in principle contain punctuation. Escaping defensively keeps
 * the detector robust if the model emits e.g. `"u.s. flag"`.
 */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pre-compiled banned-words pattern.
 *
 * Built once at module load. The pattern is:
 *
 *   \b(?: word1 | word2 | ... )\b
 *
 * with the `i` flag for case-insensitive matching. `\b` (a word
 * boundary) anchors to the transition between a word character
 * (`[A-Za-z0-9_]`) and a non-word character, which gives us the
 * "whole word" semantics required by Requirement 5.5: "great." hits
 * because `.` is a non-word character, but "greatness" does not
 * because the boundary on the right is between two word characters.
 */
const BANNED_WORDS_PATTERN = new RegExp(
  `\\b(?:${BANNED_WORDS.map(escapeRegex).join("|")})\\b`,
  "i",
);

/**
 * Count words in `commentary` by splitting on runs of Unicode
 * whitespace and discarding empty tokens. Leading and trailing
 * whitespace is trimmed first so a string like `"  hello world  "`
 * counts as `2`, not `4`.
 *
 * Note this counts tokens, not English "words" in the linguistic
 * sense; "don't" is one token, "world-class" is one token. That
 * matches how the design.md acceptance examples count words and how
 * the few-shot prompts in `lib/vision/src/few-shot/` count them.
 */
function countWords(commentary: string): number {
  const trimmed = commentary.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Return `true` when at least one entry in `imageNouns` appears as a
 * whole word in `commentary` (case-insensitive). Empty / whitespace-
 * only nouns are skipped so a stray empty string from the model does
 * not satisfy the grounding rule by accident.
 *
 * Multi-token nouns (e.g. `"gaming chair"`) are matched as a single
 * fixed phrase with word boundaries on each end. The whitespace
 * between tokens is treated literally; we do NOT collapse runs of
 * whitespace because the model is asked to emit canonical noun forms.
 */
function commentaryReferencesAnyNoun(
  commentary: string,
  imageNouns: readonly string[],
): boolean {
  for (const rawNoun of imageNouns) {
    const noun = rawNoun.trim();
    if (noun.length === 0) continue;
    const startBoundary = /^\w/.test(noun) ? "\\b" : "";
    const endBoundary = /\w$/.test(noun) ? "\\b" : "";
    const pattern = new RegExp(`${startBoundary}${escapeRegex(noun)}${endBoundary}`, "i");
    if (pattern.test(commentary)) return true;
  }
  return false;
}

/**
 * Run the three slop checks against `commentary`, given the
 * `imageNouns` the Vision Model emitted alongside it.
 *
 * Checks fire in this order:
 *
 *   1. word_count    — cheapest, rejects most obviously broken output
 *   2. banned_word   — fixed-pattern regex against the brand-tone
 *                      deny-list
 *   3. no_image_noun — per-noun regex scan
 *
 * The first failing check wins; later checks are not evaluated. This
 * ordering only affects which `reason` is reported; the accept/reject
 * decision is the AND of all three rules.
 *
 * On accept, `{ ok: true }` is returned and the orchestrator keeps
 * the model's commentary verbatim. On reject, the orchestrator
 * replaces the commentary via `pickFallback(category, tier,
 * imageNouns, seed)` (task 8.4) and sets `commentarySource =
 * 'fallback'` on the persisted Scan.
 */
export function detectSlop(
  commentary: string,
  imageNouns: readonly string[],
): SlopVerdict {
  const wordCount = countWords(commentary);
  if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
    return { ok: false, reason: "word_count" };
  }

  if (BANNED_WORDS_PATTERN.test(commentary)) {
    return { ok: false, reason: "banned_word" };
  }

  if (!commentaryReferencesAnyNoun(commentary, imageNouns)) {
    return { ok: false, reason: "no_image_noun" };
  }

  return { ok: true };
}

import { INJECTION_PATTERNS } from "./injection-patterns.js";
import { findProfanitySpans, stripSpans } from "./profanity.js";

/**
 * Maximum persisted description length. Mirrors the database CHECK and the
 * client-side character counter (Requirement 3.6).
 */
export const MAX_DESCRIPTION_LENGTH = 120;

export interface SanitizationResult {
  /** Sanitized description, or `null` when nothing usable remains. */
  sanitized: string | null;
  /** True when the profanity filter stripped at least one span. */
  profanityStripped: boolean;
  /** True when the prompt-injection filter stripped at least one span. */
  injectionStripped: boolean;
}

/**
 * Sanitize a user-supplied description before it reaches the Vision Model and
 * before it is persisted on the Scan record.
 *
 * Behavior (Requirements 3.6, 3.7, 14.5):
 *   1. Strip every span matching any prompt-injection pattern. Repeats until
 *      the text is stable so iterative reductions cannot reveal a fresh match.
 *   2. Strip every profanity span, with leet substitutions normalized before
 *      matching but stripped from the original text so the surrounding chars
 *      are preserved verbatim.
 *   3. Collapse runs of whitespace introduced by the strips into a single
 *      space and trim the ends.
 *   4. If the result is empty (or whitespace-only), return `null` so the Scan
 *      proceeds without a description. Otherwise cap the result at 120 chars.
 *
 * The function is total: any string in, a `SanitizationResult` out. It never
 * throws. Idempotence (Property 41) and the length cap (Property 42) are
 * guaranteed by the final normalize-cap pass.
 */
export function sanitizeDescription(input: string): SanitizationResult {
  if (typeof input !== "string" || input.length === 0) {
    return { sanitized: null, profanityStripped: false, injectionStripped: false };
  }

  // 1. Strip prompt-injection spans iteratively. Each pattern is non-global so
  //    we re-run the loop after a strip to catch newly-adjacent matches.
  let working = input;
  let injectionStripped = false;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(working)) {
        working = working.replace(pattern, " ");
        injectionStripped = true;
        changed = true;
      }
    }
  }

  // 2. Strip profanity spans. Done after injection stripping so leet-encoded
  //    profanity inside an injection block doesn't get double-counted.
  const profanitySpans = findProfanitySpans(working);
  const profanityStripped = profanitySpans.length > 0;
  if (profanityStripped) {
    working = stripSpans(working, profanitySpans);
  }

  // 3. Normalize whitespace and trim. Sanitization can introduce runs of
  //    spaces where spans were excised; collapsing them keeps the output
  //    idempotent under repeated calls.
  working = working.replace(/\s+/g, " ").trim();

  // 4. Empty? Drop to null. Otherwise cap.
  if (working.length === 0) {
    return { sanitized: null, profanityStripped, injectionStripped };
  }

  if (working.length > MAX_DESCRIPTION_LENGTH) {
    working = working.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd();
    if (working.length === 0) {
      return { sanitized: null, profanityStripped, injectionStripped };
    }
  }

  return { sanitized: working, profanityStripped, injectionStripped };
}

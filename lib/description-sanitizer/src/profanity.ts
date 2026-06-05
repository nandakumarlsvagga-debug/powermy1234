/**
 * Profanity deny-list with leet mapping.
 *
 * The deny-list is intentionally compact: it covers the categories most likely
 * to leak into commentary and share cards. The leet map is applied to a
 * normalized copy of the input, then matched offsets are mapped back onto the
 * original string so we can strip exactly the offending span without disturbing
 * the surrounding text.
 *
 * The list is curated to base forms only; the leet normalization handles
 * common substitutions (e.g. `sh1t`, `f@ck`, `b!tch`) without having to
 * enumerate every variant.
 */
export const PROFANITY_DENY_LIST: ReadonlyArray<string> = [
  "fuck",
  "fucker",
  "fucking",
  "shit",
  "bullshit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "cock",
  "pussy",
  "twat",
  "wanker",
  "bastard",
  "douche",
  "slut",
  "whore",
  "retard",
  "faggot",
  "nigger",
  "nigga",
  "kike",
  "spic",
  "chink",
  "gook",
  "tranny",
  "dyke",
];

/**
 * Single-character leet substitution table. Each leet char maps to the latin
 * letter it most commonly substitutes for. We deliberately keep this narrow:
 * over-broad maps cause false positives (e.g. mapping `5` to `s` inside
 * legitimate model numbers).
 */
const LEET_MAP: Readonly<Record<string, string>> = {
  "@": "a",
  "4": "a",
  "8": "b",
  "(": "c",
  "3": "e",
  "€": "e",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  "$": "s",
  "5": "s",
  "7": "t",
  "+": "t",
};

/**
 * Build a normalized lowercase copy of `input` with common leet substitutions
 * applied. The returned string has the same length as `input` so indices map
 * 1:1 between the two.
 */
export function normalizeForProfanity(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!.toLowerCase();
    out += LEET_MAP[ch] ?? ch;
  }
  return out;
}

interface Span {
  start: number;
  end: number;
}

/**
 * Locate every profanity span in `input` against the normalized copy, using
 * whole-word matching on word boundaries. Returns spans sorted ascending by
 * start offset; overlapping spans are merged.
 */
export function findProfanitySpans(input: string): Span[] {
  if (input.length === 0) return [];
  const normalized = normalizeForProfanity(input);
  const spans: Span[] = [];

  for (const word of PROFANITY_DENY_LIST) {
    // Whole-word, case-insensitive (already lowercased via normalize).
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized)) !== null) {
      spans.push({ start: match.index, end: match.index + match[0].length });
      // Avoid zero-length advance on degenerate matches.
      if (match[0].length === 0) re.lastIndex++;
    }
  }

  return mergeSpans(spans);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeSpans(spans: Span[]): Span[] {
  if (spans.length <= 1) return spans.slice().sort((a, b) => a.start - b.start);
  const sorted = spans.slice().sort((a, b) => a.start - b.start);
  const merged: Span[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!;
    const cur = sorted[i]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

/**
 * Remove the listed spans from `input`. Spans are expected to be
 * non-overlapping and sorted ascending (as returned by `findProfanitySpans`).
 */
export function stripSpans(input: string, spans: ReadonlyArray<Span>): string {
  if (spans.length === 0) return input;
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += input.slice(cursor, span.start);
    cursor = span.end;
  }
  out += input.slice(cursor);
  return out;
}

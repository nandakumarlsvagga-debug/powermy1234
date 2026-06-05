/**
 * Prompt-injection patterns. Pattern-matcher (not LLM-based) so it cannot be
 * jailbroken via the same model. Source of truth: design.md §"Description
 * Sanitization (Req 14.5)".
 *
 * Patterns intentionally use the non-global form so that callers (and the
 * Property 43 test) can call `p.test(...)` without the stateful `lastIndex`
 * pitfalls of `/g` regexes. The sanitizer applies them iteratively until no
 * further match remains.
 */
export const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore (?:all |the |your )?previous (?:instructions|directions|rules)/i,
  /you are now /i,
  /system prompt/i,
  /^\s*system:/im,
  /\bact as\b/i,
  /\bjailbreak\b/i,
  /\bdeveloper mode\b/i,
  // Role tokens like <|im_start|>, <|system|>, <|assistant|> etc.
  /<\|[^|]*\|>/,
  // Control characters (incl. NUL, BEL, ESC, DEL).
  /[\u0000-\u001F\u007F]/,
];

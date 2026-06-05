/**
 * Few-shot example types for the Bedrock Nova Lite adapter.
 *
 * Each Category has its own file (`./{category}.ts`) exporting a typed
 * array of 12–20 `FewShotExample` records (Requirement 5.4). The Bedrock
 * client renders these examples into the system prompt at call time via
 * `renderFewShotBlock` so the model anchors on brand tone.
 *
 * The shape is deliberately small. The model never sees full structured
 * JSON in the prompt — only the line of commentary, the supporting
 * `imageNouns` it must reference, and a one-line scene description so the
 * tone-to-context association is learnable in-context.
 *
 * Slop-detector grounding: each example MUST satisfy
 *   - `commentary` word count ∈ [8, 14]
 *   - `commentary` references at least one `imageNouns` entry as a whole
 *      word (case-insensitive)
 *   - `commentary` contains no banned word
 *
 * These constraints are validated by the slop detector's build-time
 * sanity check (task 8.4 — fallback library) and re-validated by the
 * unit tests for this adapter (task 8.6 / 8.8).
 */

/**
 * A single few-shot example for the Vision Adapter prompt.
 */
export interface FewShotExample {
  /**
   * One-line scene description fed to the model as the "assistant
   * input" surrogate. Keeps the model anchored on what kind of subject
   * each example commentary is calling out.
   */
  scene: string;

  /**
   * 1–6 nouns visible in the scene. The commentary must reference at
   * least one of these as a whole word; the slop detector enforces the
   * same rule on real model output (Requirement 5.5).
   */
  imageNouns: readonly string[];

  /**
   * The 8–14 word commentary line. Brand tone: confident scouter,
   * concrete, specific, slightly menacing — never neutral, never flat.
   */
  commentary: string;
}

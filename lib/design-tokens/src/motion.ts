/**
 * Motion preset library — the single source of motion in POWERLVL.
 *
 * Per Req 12.11 every animation in the product MUST consume one of the
 * presets defined here. Custom per-component spring values are forbidden
 * outside an allow-listed set of motion wrappers.
 *
 * The shape of each preset is intentionally framework-agnostic so the
 * presets can flow through Framer Motion (web client) and into static
 * computations for the share-card renderer without dragging a runtime
 * dependency into either consumer.
 */

/**
 * Spring presets used for transform and scale animations (Req 12.11).
 *
 * - `premium` — default surface-level transitions
 * - `snap`    — secondary element entrances inside the reveal sequence
 * - `drift`   — slow ambient HUD telemetry
 * - `slam`    — the score slam moment in the reveal pipeline
 */
export const SPRINGS = {
  premium: { type: 'spring', stiffness: 320, damping: 28, mass: 1 },
  snap: { type: 'spring', stiffness: 600, damping: 32, mass: 0.8 },
  drift: { type: 'spring', stiffness: 120, damping: 22, mass: 1.2 },
  slam: { type: 'spring', stiffness: 900, damping: 18, mass: 1.4 },
} as const

/**
 * Cubic-bezier easings used for non-spring transitions (Req 12.11).
 * `premium` is the default premium easing; `outQuad` is reserved for
 * HUD chrome reveals where decelerating-only motion reads cleaner.
 */
export const EASINGS = {
  premium: [0.16, 1.0, 0.3, 1.0],
  outQuad: [0.0, 0.0, 0.58, 1.0],
} as const

/**
 * Canonical durations in seconds for UI transitions and the reveal
 * sequence. The `uiTransition` ceiling enforces Req 12.14 (≤ 300 ms for
 * every non-reveal UI transition).
 */
export const DURATIONS = {
  uiTransition: 0.24, // ≤ 300 ms (Req 12.14)
  hudFade: 0.18,
  revealLockOn: 1.5,
  revealScanSweep: 3.0,
  revealAnalysis: 2.0,
  revealSlam: 0.5,
  revealSequence: 2.5,
} as const

export type SpringPreset = (typeof SPRINGS)[keyof typeof SPRINGS]
export type EasingPreset = (typeof EASINGS)[keyof typeof EASINGS]
export type Duration = (typeof DURATIONS)[keyof typeof DURATIONS]

/**
 * The shape every motion-preset consumer must accept.
 *
 * `kind` discriminates spring presets from cubic-bezier tween presets so
 * consumers can dispatch on the safe path without inspecting the inner
 * fields.
 */
export type MotionPreset =
  | { kind: 'spring'; spring: SpringPreset }
  | { kind: 'tween'; ease: EasingPreset; duration: number }

/**
 * Reduced-motion adaptation (Req 12.15 / Req 4.10).
 *
 * Swaps any transform-or-scale spring for a 200 ms cross-fade tween while
 * preserving content and ordering at the consumer layer. Tween presets are
 * also normalized to a 200 ms cross-fade so reduced-motion users receive
 * a consistent, calm transition envelope.
 *
 * The reveal sequencer (lib/reveal-controller) routes every preset it
 * intends to play through this helper when `prefers-reduced-motion: reduce`
 * is set.
 */
export function withReducedMotion(preset: MotionPreset): MotionPreset {
  return {
    kind: 'tween',
    ease: EASINGS.premium,
    duration: 0.2,
  }
}

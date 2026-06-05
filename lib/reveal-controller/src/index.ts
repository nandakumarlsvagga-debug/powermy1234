/**
 * `@workspace/reveal-controller` — public surface.
 *
 * The reveal controller is the pure phase sequencer that drives the
 * cinematic 7–10 s reveal on the POWERLVL web client. It owns timing
 * (when each named phase fires) but knows nothing about rendering.
 * Rendering is the consumer's responsibility — the controller forwards a
 * `reducedMotion` flag through every emission so consumers can route
 * their motion presets through `withReducedMotion` from
 * `@workspace/design-tokens` without the controller importing any
 * rendering primitives.
 *
 * Typical use from the React layer:
 *
 *   const ctrl = createRevealController()
 *   const handle = ctrl.start({
 *     submittedAt: performance.now(),
 *     responsePromise: api.scans.create(payload),
 *     reducedMotion: prefersReducedMotion,
 *     onPhase: (phase, ctx) => setRevealPhase(phase, ctx),
 *   })
 *   // later
 *   handle.cancel()
 *
 * Tests inject a `FakePerformance` clock and a manual frame scheduler
 * via `createRevealController({ performance, scheduler })` so the
 * timeline can be driven deterministically; see
 * `test/reveal.properties.spec.ts`.
 */

export { createRevealController } from "./controller.js";

export {
  ANALYSIS_MIN_MS,
  ANALYSIS_START_MS,
  FALLBACK_REVEAL_VARIANT,
  LOCK_ON_START_MS,
  MAX_TOTAL_MS,
  REVEAL_DURATION_MS,
  SCAN_SWEEP_START_MS,
  SLAM_DEADLINE_MS,
  SLAM_DURATION_MS,
} from "./timing.js";

export type {
  FrameScheduler,
  PerformanceLike,
  RevealContext,
  RevealContextSource,
  RevealController,
  RevealHandle,
  RevealPhase,
  RevealResponse,
  RevealStartOptions,
  RevealVariant,
} from "./types.js";

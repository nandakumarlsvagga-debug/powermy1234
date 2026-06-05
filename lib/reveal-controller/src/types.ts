/**
 * Public types for the POWERLVL reveal controller.
 *
 * The controller is the pure phase sequencer that drives the cinematic 7–10 s
 * reveal on the web client. Its only job is to decide *when* each named phase
 * fires; rendering the actual HUD frames, score, tier, and stats is the
 * caller's responsibility (the React layer in `artifacts/web`).
 *
 * Keeping the controller pure (no DOM, no Framer Motion, no React) lets us
 * exhaustively property-test the timing contract from Requirement 4 against
 * a deterministic clock and a controllable response promise.
 */

/**
 * The reveal animation is a strictly ordered finite state machine. The
 * controller is constructed in `idle`, transitions to `lockOn` on `start`,
 * walks through `scanSweep` → `analysis` → `slam` → `reveal`, and ends at
 * `done`.
 *
 * The order is preserved under both the standard motion path and the
 * reduced-motion cross-fade path (Requirements 4.1, 4.7, 4.10, 12.15).
 */
export type RevealPhase =
  | "idle"
  | "lockOn"
  | "scanSweep"
  | "analysis"
  | "slam"
  | "reveal"
  | "done";

/**
 * The reveal variant the client should play. Mirrors the `RevealVariant`
 * enum in `@workspace/api-zod`. Re-declared locally so the controller has
 * zero runtime dependency on the API layer (kept in sync by a type test).
 */
export type RevealVariant =
  | "standard"
  | "power_surge"
  | "forbidden_aura"
  | "scouter_failure"
  | "unregistered_energy"
  | "chaos_spike";

/**
 * The fields of `CreateScanResponse` the controller actually consumes. The
 * controller does not care about the full Scan payload; the React layer
 * keeps that and only forwards the reveal-sync hints. Declaring a
 * structurally-narrower interface here keeps the controller portable
 * across the web client and any future renderer (e.g. a native preview).
 */
export interface RevealResponse {
  reveal: {
    /** ms elapsed in the API pipeline before the response was emitted */
    serverElapsedMs: number;
    /** Anomaly-driven reveal variant the client must play */
    revealVariant: RevealVariant;
  };
}

/**
 * Source of the payload driving the current phase emission. The controller
 * waits on `responsePromise`; if the response arrives within the budget,
 * the variant is taken from the response (`source: 'response'`). If the
 * response misses `MAX_TOTAL_MS`, the controller emits a deterministic
 * neutral payload locally (`source: 'fallback'`) and forces the
 * `scouter_failure` variant, satisfying Requirement 4.5.
 */
export type RevealContextSource = "response" | "fallback";

/**
 * Phase context delivered alongside every `onPhase` callback. The fields
 * carried here are the minimum the React layer needs to drive UI without
 * owning timing. `revealVariant` is `null` until the response arrives or
 * the fallback fires, so callers can render generic chrome in earlier
 * phases without committing to a variant.
 */
export interface RevealContext {
  /** Wall-clock ms since `start({ submittedAt })`, computed via `performance.now() - submittedAt`. */
  elapsedMs: number;
  /** Variant locked in for this reveal once known; null in earlier phases. */
  revealVariant: RevealVariant | null;
  /** Whether reduced-motion adaptation is active for this run. */
  reducedMotion: boolean;
  /** How the variant was determined when known; `'response'` until fallback fires. */
  source: RevealContextSource;
  /** Whether the API response has resolved at the moment of this emission. */
  responseReady: boolean;
}

/**
 * Options accepted by `RevealController.start`.
 */
export interface RevealStartOptions {
  /**
   * The wall-clock value of `performance.now()` captured the instant the
   * user pressed submit. The controller subtracts this from every
   * subsequent `performance.now()` reading to derive elapsed ms.
   *
   * Passing `submittedAt` lets the React layer kick off the lock-on phase
   * locally before the controller is constructed, so motion never lags
   * behind the user's input by a render frame.
   */
  submittedAt: number;

  /**
   * The promise returned by the `POST /api/scans` request. The controller
   * does not own the request; it only waits on the result so it can
   * (a) lock in a variant when the response arrives in budget, or
   * (b) fall through to the deterministic neutral fallback when the
   * response misses `MAX_TOTAL_MS`.
   */
  responsePromise: Promise<RevealResponse>;

  /**
   * Phase emission callback. Invoked exactly once per phase transition
   * with the current context. Errors thrown from `onPhase` are caught and
   * silently dropped so an unbehaving consumer cannot strand the
   * controller in a non-terminal state — the scheduler always reaches
   * `done` (or `cancel()` is called).
   */
  onPhase: (phase: RevealPhase, ctx: RevealContext) => void;

  /**
   * `true` when the user has the `prefers-reduced-motion: reduce` system
   * preference set. The controller forwards this flag through every
   * emission so consumers route their motion presets through
   * `withReducedMotion` from `@workspace/design-tokens`.
   *
   * Note: the *order* of emissions and the *total duration* are unchanged
   * by reduced motion (Requirement 4.10). Only the rendered animation
   * primitives change at the consumer layer.
   */
  reducedMotion: boolean;
}

/**
 * Handle returned by `start`. Calling `cancel` aborts every pending
 * scheduled transition and prevents `done` from firing if it has not
 * already. Idempotent.
 */
export interface RevealHandle {
  cancel: () => void;
}

/**
 * Public surface of the reveal controller.
 *
 * Each `RevealController` instance is single-shot: `start` may be called
 * at most once. To run a second reveal, construct a new controller (the
 * sequencer holds no shared state across instances).
 */
export interface RevealController {
  start(opts: RevealStartOptions): RevealHandle;
}

/**
 * Minimal `performance`-shaped clock used by the controller. Production
 * passes `globalThis.performance`; tests pass a `FakePerformance` that
 * advances time on demand. Both implementations must return monotonic
 * values via `now()` (Requirement 4.2 depends on monotonic deltas to
 * keep the total reveal duration inside [7000, 10000] ms).
 */
export interface PerformanceLike {
  now(): number;
}

/**
 * Minimal scheduler surface. `requestFrame` mirrors `requestAnimationFrame`
 * (the controller schedules every transition on a frame tick), and
 * `cancelFrame` mirrors `cancelAnimationFrame` so `cancel()` can drop a
 * pending callback without emitting it. Tests inject a manual scheduler
 * that flushes pending callbacks on demand.
 */
export interface FrameScheduler {
  requestFrame(cb: (now: number) => void): number;
  cancelFrame(handle: number): void;
}

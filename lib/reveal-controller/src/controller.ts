/**
 * `RevealController` — pure phase sequencer for the POWERLVL cinematic
 * reveal. Implements the timing contract defined in Requirements 4.1–4.10
 * and the "Reveal Sync" section of the design document.
 *
 * The controller is intentionally renderer-agnostic. It exposes a single
 * `start` method that returns a cancellation handle and a single
 * `onPhase` callback through which it emits ordered transitions:
 *
 *     idle → lockOn → scanSweep → analysis → slam → reveal → done
 *
 * Rendering — HUD frames, score slam, tier reveal, reduced-motion cross-fade,
 * anomaly variants — is the consumer's job. Routing through
 * `withReducedMotion` from `@workspace/design-tokens` is the consumer's job.
 * The controller's only motion concern is *propagating the reduced-motion
 * flag* through every emission so the consumer can route correctly
 * (Requirement 12.15 / 4.10).
 *
 * The scheduler runs every transition on a `requestAnimationFrame` tick
 * against `performance.now()` deltas so timing is monotonic and aligned
 * with the renderer. Both `performance` and the frame scheduler are
 * injected so tests can drive the sequencer with a `FakePerformance`
 * clock and a manual frame loop.
 */

import { EASINGS, withReducedMotion } from "@workspace/design-tokens";

import {
  ANALYSIS_MIN_MS,
  ANALYSIS_START_MS,
  FALLBACK_REVEAL_VARIANT,
  LOCK_ON_START_MS,
  REVEAL_DURATION_MS,
  SCAN_SWEEP_START_MS,
  SLAM_DEADLINE_MS,
  SLAM_DURATION_MS,
} from "./timing.js";
import type {
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

/*
 * Reduced-motion behavior:
 *
 * Requirement 4.10 says reduced-motion swaps every transform/scale animation
 * for a cross-fade WITHOUT changing element ordering or the Score-first
 * hierarchy. The controller therefore emits the SAME phase sequence under
 * `reducedMotion: true`, simply forwarding the flag in every `RevealContext`
 * so the consumer can route their motion presets through `withReducedMotion`.
 *
 * We perform the route at controller startup as a self-test: if the
 * design-tokens helper is ever removed or behaves unexpectedly the
 * controller fails fast at construction rather than mid-reveal. The
 * resulting preset is unused at runtime — consumers route their own
 * presets — but referencing it here keeps the design-tokens contract
 * tested at the controller boundary.
 */
function selfTestReducedMotion(): void {
  void withReducedMotion({ kind: "tween", ease: EASINGS.premium, duration: 0 });
}

/** Sentinel returned by the default scheduler when no frame is queued. */
const NO_FRAME = -1;

/**
 * Default scheduler used when the consumer does not inject one. Falls
 * back to `setTimeout` at ~60 fps in non-DOM environments (server-side
 * rendering, tests that forget to inject) so the sequencer always makes
 * forward progress.
 */
function defaultScheduler(): FrameScheduler {
  const g = globalThis as {
    requestAnimationFrame?: (cb: (now: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  if (
    typeof g.requestAnimationFrame === "function" &&
    typeof g.cancelAnimationFrame === "function"
  ) {
    const raf = g.requestAnimationFrame;
    const caf = g.cancelAnimationFrame;
    return {
      requestFrame: (cb) => raf(cb),
      cancelFrame: (handle) => caf(handle),
    };
  }
  return {
    requestFrame: (cb) => {
      const id = setTimeout(() => cb(Date.now()), 16);
      return id as unknown as number;
    },
    cancelFrame: (handle) => {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    },
  };
}

/**
 * Default `performance`-shaped clock used when the consumer does not
 * inject one. In a browser this is `globalThis.performance`; in Node 18+
 * it is also globally available. Falls back to `Date.now()` if neither
 * is available so the controller still progresses (with reduced
 * monotonicity guarantees).
 */
function defaultPerformance(): PerformanceLike {
  const perf = (globalThis as { performance?: PerformanceLike }).performance;
  if (perf && typeof perf.now === "function") return perf;
  return { now: () => Date.now() };
}

/**
 * Construct a `RevealController` with the given clock and frame scheduler.
 * Both are optional; production callers pass nothing and get the global
 * `performance` plus `requestAnimationFrame`. Tests pass a `FakePerformance`
 * and a manual frame scheduler so the timeline can be driven deterministically.
 */
export function createRevealController(opts?: {
  performance?: PerformanceLike;
  scheduler?: FrameScheduler;
}): RevealController {
  // Run the self-test once per controller construction so a missing/broken
  // `withReducedMotion` surfaces during instantiation instead of mid-reveal.
  selfTestReducedMotion();

  const perf = opts?.performance ?? defaultPerformance();
  const scheduler = opts?.scheduler ?? defaultScheduler();
  return new RevealControllerImpl(perf, scheduler);
}

/**
 * Per-run mutable state. One of these is created per `start` call. All
 * scheduler callbacks read and mutate it; the controller never shares
 * state across runs.
 */
interface RunState {
  readonly submittedAt: number;
  readonly reducedMotion: boolean;
  readonly onPhase: (phase: RevealPhase, ctx: RevealContext) => void;
  readonly perf: PerformanceLike;
  readonly scheduler: FrameScheduler;
  currentFrame: number;
  phase: RevealPhase;
  cancelled: boolean;
  response: RevealResponse | null;
  responseReady: boolean;
  lockedVariant: RevealVariant | null;
  lockedSource: RevealContextSource;
  /** Wall-clock elapsed-ms at which the `slam` phase fired. */
  slamStartedAt: number | null;
  /** Wall-clock elapsed-ms at which the `reveal` phase fired. */
  revealStartedAt: number | null;
}

/**
 * Internal implementation. Exported indirectly via
 * `createRevealController` — consumers should never construct this class
 * directly.
 */
class RevealControllerImpl implements RevealController {
  private started = false;

  constructor(
    private readonly perf: PerformanceLike,
    private readonly scheduler: FrameScheduler,
  ) {}

  start(opts: RevealStartOptions): RevealHandle {
    if (this.started) {
      // Single-shot guarantee — defensive guard so misuse cannot strand a
      // second concurrent timeline against the same emitter.
      throw new Error(
        "RevealController.start may be called at most once per instance",
      );
    }
    this.started = true;

    const state: RunState = {
      submittedAt: opts.submittedAt,
      reducedMotion: opts.reducedMotion,
      onPhase: opts.onPhase,
      perf: this.perf,
      scheduler: this.scheduler,
      currentFrame: NO_FRAME,
      phase: "idle",
      cancelled: false,
      response: null,
      responseReady: false,
      lockedVariant: null,
      lockedSource: "response",
      slamStartedAt: null,
      revealStartedAt: null,
    };

    // Subscribe to the response. We do not await — we listen, then let the
    // scheduler drive every transition. This split lets the analysis phase
    // *hold* while the response is pending and *extend* up to the slam
    // deadline before falling back to the neutral payload (Requirements
    // 4.3, 4.4, 4.5).
    opts.responsePromise.then(
      (response) => {
        if (state.cancelled) return;
        state.response = response;
        state.responseReady = true;
        // The scheduler picks up the new state on its next tick. We do not
        // emit anything from inside this `.then` handler so phase order is
        // controlled exclusively by the frame loop.
      },
      () => {
        if (state.cancelled) return;
        // Treat a rejection like a missed response: the analysis phase will
        // extend to the slam deadline and the controller will fall through
        // to the deterministic neutral fallback (Requirement 4.5).
        state.response = null;
        state.responseReady = true;
      },
    );

    // Kick off the frame loop. We schedule the first tick on the next frame
    // so emissions never run synchronously inside `start`; consumers can
    // therefore safely call `start` and then attach DOM in the same task.
    schedule(state);

    return {
      cancel: () => {
        if (state.cancelled) return;
        state.cancelled = true;
        if (state.currentFrame !== NO_FRAME) {
          state.scheduler.cancelFrame(state.currentFrame);
          state.currentFrame = NO_FRAME;
        }
      },
    };
  }
}

function schedule(state: RunState): void {
  if (state.cancelled) return;
  state.currentFrame = state.scheduler.requestFrame(() => {
    state.currentFrame = NO_FRAME;
    tick(state);
  });
}

/**
 * Single frame tick. Computes `elapsedMs`, decides the next phase to
 * emit, fires the callback, and reschedules unless the timeline has
 * reached `done`.
 *
 * The ordering rule: a phase fires the first time its scheduled start
 * time is reached. `analysis` is special because it can hold past
 * `ANALYSIS_MIN_MS` waiting for the response, and `slam` is the latch
 * that locks in the variant.
 */
function tick(state: RunState): void {
  if (state.cancelled) return;
  const now = state.perf.now();
  const elapsed = Math.max(0, now - state.submittedAt);

  switch (state.phase) {
    case "idle": {
      if (elapsed >= LOCK_ON_START_MS) {
        emit(state, "lockOn", elapsed);
      }
      break;
    }
    case "lockOn": {
      if (elapsed >= SCAN_SWEEP_START_MS) {
        emit(state, "scanSweep", elapsed);
      }
      break;
    }
    case "scanSweep": {
      if (elapsed >= ANALYSIS_START_MS) {
        emit(state, "analysis", elapsed);
      }
      break;
    }
    case "analysis": {
      // Slam fires when both:
      //   (a) we are past the choreographed minimum (ANALYSIS_MIN_MS), AND
      //   (b) the response has resolved OR we have hit SLAM_DEADLINE_MS.
      // This satisfies Requirements 4.3 (hold for early response) and
      // 4.4 (extend up to MAX_TOTAL_MS for a late response). The slam
      // deadline is computed so the subsequent slam + reveal phases
      // still finish inside the 10 000 ms envelope.
      const pastMin = elapsed >= ANALYSIS_MIN_MS;
      const pastSlamDeadline = elapsed >= SLAM_DEADLINE_MS;
      if (pastMin && (state.responseReady || pastSlamDeadline)) {
        lockVariant(state);
        emit(state, "slam", elapsed);
      }
      break;
    }
    case "slam": {
      if (
        state.slamStartedAt !== null &&
        elapsed - state.slamStartedAt >= SLAM_DURATION_MS
      ) {
        emit(state, "reveal", elapsed);
      }
      break;
    }
    case "reveal": {
      if (
        state.revealStartedAt !== null &&
        elapsed - state.revealStartedAt >= REVEAL_DURATION_MS
      ) {
        emit(state, "done", elapsed);
      }
      break;
    }
    case "done": {
      // Terminal state — no more frames to schedule.
      return;
    }
  }

  if ((state.phase as RevealPhase) !== "done" && !state.cancelled) {
    schedule(state);
  }
}

/**
 * Decide the variant for this reveal at the moment slam fires.
 *
 * - If the response arrived inside the budget, use its `revealVariant`
 *   verbatim and tag the source as `'response'`. This is the
 *   determinism property covered by Property 36 — the variant played
 *   equals the variant the API server returned.
 * - If the slam deadline elapsed without a usable response, the
 *   controller emits the `scouter_failure` fallback against a
 *   deterministic neutral payload (Requirements 4.5, 7.1). The neutral
 *   payload itself is computed by the consumer; the controller's job is
 *   only to surface the variant and the source.
 */
function lockVariant(state: RunState): void {
  if (state.responseReady && state.response !== null) {
    state.lockedVariant = state.response.reveal.revealVariant;
    state.lockedSource = "response";
  } else {
    state.lockedVariant = FALLBACK_REVEAL_VARIANT;
    state.lockedSource = "fallback";
  }
}

function emit(state: RunState, phase: RevealPhase, elapsed: number): void {
  state.phase = phase;
  if (phase === "slam") state.slamStartedAt = elapsed;
  if (phase === "reveal") state.revealStartedAt = elapsed;

  const ctx: RevealContext = {
    elapsedMs: elapsed,
    revealVariant: state.lockedVariant,
    reducedMotion: state.reducedMotion,
    source: state.lockedSource,
    responseReady: state.responseReady,
  };
  try {
    state.onPhase(phase, ctx);
  } catch {
    // A throwing consumer must not strand the sequencer in a
    // non-terminal phase. Swallow and keep advancing; logging is the
    // consumer's responsibility.
  }
}

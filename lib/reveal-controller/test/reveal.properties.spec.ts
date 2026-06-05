/**
 * Property-based tests for `createRevealController`.
 *
 * The controller in `lib/reveal-controller/src/controller.ts` is the pure
 * phase sequencer that drives the cinematic 7–10 s reveal. It owns a
 * deterministic FSM (`lockOn → scanSweep → analysis → slam → reveal → done`)
 * scheduled against a `performance.now()` clock and a
 * `requestAnimationFrame`-shaped scheduler. Both injection points are
 * exercised here via a `FakePerformance` that only advances on demand and a
 * manual frame queue, so every property below can drive the timeline by
 * hand without any real time elapsing.
 *
 * The properties verify the timing contract from Requirements 4.1–4.10:
 *
 * - **Property 32** — total `lockOn → done` wall-clock time ∈ [7000, 10000] ms
 * - **Property 33** — `slam` fires no earlier than `ANALYSIS_MIN_MS` (6500 ms)
 * - **Property 34** — phase emission order is preserved and each phase is emitted exactly once
 * - **Property 35** — `reducedMotion=true` preserves order and the `done` timestamp; the flag is forwarded on every emission
 * - **Property 36** — when the response arrives inside the budget, the slam variant equals `response.reveal.revealVariant`
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 4.6, 4.7, 4.10, 7.1, 7.2, 12.15**
 */

import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { createRevealController } from "../src/controller.js";
import {
  ANALYSIS_MIN_MS,
  FALLBACK_REVEAL_VARIANT,
  MAX_TOTAL_MS,
  REVEAL_DURATION_MS,
  SLAM_DEADLINE_MS,
  SLAM_DURATION_MS,
} from "../src/timing.js";
import type {
  FrameScheduler,
  PerformanceLike,
  RevealContext,
  RevealPhase,
  RevealResponse,
  RevealVariant,
} from "../src/types.js";

/**
 * Pinned fast-check seed and start path. The values are arbitrary but
 * stable; pinning them keeps any future regression reproducible without
 * having to copy the seed line out of CI logs.
 */
const FC_SEED = 0x52564c43; // "RVLC"
const FC_PATH = "0";

/**
 * Per-frame tick granularity for the harness, in ms. Chosen at 100 ms so
 * worst-case "tick lag" on each phase boundary stays well below the slack
 * the [7000, 10000] ms envelope can absorb (3 boundaries × 100 ms = 300 ms,
 * vs 500 ms of envelope slack).
 *
 * Picking a smaller value would slow tests; a larger value risks the
 * cumulative tick lag pushing `done` past `MAX_TOTAL_MS`.
 */
const TICK_MS = 100;

/** Every concrete variant the API can return in `response.reveal.revealVariant`. */
const ALL_VARIANTS: readonly RevealVariant[] = [
  "standard",
  "power_surge",
  "forbidden_aura",
  "scouter_failure",
  "unregistered_energy",
  "chaos_spike",
] as const;

interface Scenario {
  /** Wall-clock ms at which to resolve the response promise, or `null` to never resolve. */
  responseAt: number | null;
  /** Variant the API would return if the promise resolves. */
  variant: RevealVariant;
  /** Reduced-motion flag passed through to the controller. */
  reducedMotion: boolean;
}

interface ScenarioResult {
  /** Every phase emission produced by the controller, in order. */
  phases: { phase: RevealPhase; ctx: RevealContext }[];
  /** Wall-clock ms at which the controller emitted `done`. -1 if it never did. */
  doneAtMs: number;
}

/**
 * Drive the controller end-to-end against a `FakePerformance` and a manual
 * frame queue. Returns the captured phase sequence and the elapsed-ms at
 * which `done` was emitted.
 *
 * The harness:
 *   1. Steps the fake clock forward by `TICK_MS` per loop iteration.
 *   2. Resolves the response promise the first time the clock crosses
 *      `responseAt` (if any) and flushes microtasks so the `.then` handler
 *      sets `state.responseReady` *before* the next frame fires.
 *   3. Drains the frame queue, which advances the FSM by at most one phase.
 *   4. Stops once `done` is emitted, or after a safety cap that comfortably
 *      exceeds `MAX_TOTAL_MS`.
 */
async function runScenario(s: Scenario): Promise<ScenarioResult> {
  let clock = 0;
  const perf: PerformanceLike = { now: () => clock };

  let nextHandle = 1;
  const queue = new Map<number, (now: number) => void>();
  const scheduler: FrameScheduler = {
    requestFrame: (cb) => {
      const handle = nextHandle++;
      queue.set(handle, cb);
      return handle;
    },
    cancelFrame: (handle) => {
      queue.delete(handle);
    },
  };

  let resolveResponse!: (r: RevealResponse) => void;
  const responsePromise = new Promise<RevealResponse>((r) => {
    resolveResponse = r;
  });

  const ctrl = createRevealController({ performance: perf, scheduler });
  const phases: { phase: RevealPhase; ctx: RevealContext }[] = [];
  ctrl.start({
    submittedAt: 0,
    responsePromise,
    reducedMotion: s.reducedMotion,
    onPhase: (phase, ctx) =>
      // Clone the context so a later mutation by the controller (which it
      // does not do today, but defensively) cannot retroactively alter what
      // we recorded for a given phase.
      phases.push({ phase, ctx: { ...ctx } }),
  });

  /** Flush enough microtask turns for the `.then` handler chain to settle. */
  const flushMicrotasks = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };

  /**
   * Fire every frame currently queued, exactly once. Any frames a callback
   * re-enqueues are deferred to the next harness iteration — they will see
   * the next clock advance, which is the only way the FSM can make
   * progress in any case.
   *
   * This snapshot-then-fire pattern (rather than a drain-until-empty loop)
   * is essential: every tick re-queues a fresh frame until the controller
   * reaches `done`, so a drain-until-empty loop would spin forever between
   * phase boundaries.
   */
  const fireQueuedFrames = () => {
    if (queue.size === 0) return;
    const callbacks = Array.from(queue.values());
    queue.clear();
    for (const cb of callbacks) cb(clock);
  };

  let resolved = s.responseAt === null;
  // Cap the loop generously past `MAX_TOTAL_MS` so a failing timeline
  // surfaces as an assertion failure (no `done` emitted) rather than a
  // hang.
  const maxIterations = Math.ceil((MAX_TOTAL_MS + 5000) / TICK_MS);

  for (let i = 0; i < maxIterations; i++) {
    clock += TICK_MS;

    if (!resolved && s.responseAt !== null && clock >= s.responseAt) {
      resolved = true;
      resolveResponse({
        reveal: { serverElapsedMs: 1000, revealVariant: s.variant },
      });
      await flushMicrotasks();
    }

    fireQueuedFrames();
    // After a frame fires it may schedule another frame *and* the response
    // promise's `.then` handler may run interleaved on the microtask queue.
    // Flush + fire once more so the tick that observes `responseReady`
    // never lags a full TICK_MS behind the resolution.
    await flushMicrotasks();
    fireQueuedFrames();

    const done = phases.find((p) => p.phase === "done");
    if (done !== undefined) {
      return { phases, doneAtMs: done.ctx.elapsedMs };
    }
  }

  return { phases, doneAtMs: -1 };
}

/**
 * Arbitrary for the resolution timing. We mix in `null` to exercise the
 * "response never arrives" branch (Requirement 4.5 fallback) and bias the
 * numeric values across the interesting range:
 *
 *  - `[0, 6500)`     — early (response arrives before `ANALYSIS_MIN_MS`)
 *  - `[6500, 7000)`  — on-time (between min hold and slam deadline)
 *  - `[7000, 12000]` — late (after the slam deadline; controller falls back)
 */
const responseAtArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant<number | null>(null) },
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 12000 }) },
);

const variantArb = fc.constantFrom(...ALL_VARIANTS);
const reducedMotionArb = fc.boolean();

const scenarioArb = fc.record<Scenario>({
  responseAt: responseAtArb,
  variant: variantArb,
  reducedMotion: reducedMotionArb,
});

/** The controller must always reach `done`; phrase it as a helper so each property reads cleanly. */
function expectReachedDone(result: ScenarioResult): void {
  expect(result.doneAtMs).toBeGreaterThanOrEqual(0);
}

describe("RevealController properties", () => {
  /**
   * **Property 32: Reveal Total Duration Bound**
   *
   * Total wall-clock time from `start` (t = 0) to the controller's `done`
   * emission lies inside the [7000 ms, 10000 ms] envelope (Requirement 4.2).
   *
   * The envelope absorbs up to ~3 ticks of cumulative scheduler lag at
   * `TICK_MS = 100 ms`; the harness pins the tick granularity to keep the
   * worst case below the upper bound.
   *
   * Validates: Requirements 4.2
   */
  test("Property 32: total reveal duration ∈ [7000, 10000] ms", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const result = await runScenario(s);
        expectReachedDone(result);
        expect(result.doneAtMs).toBeGreaterThanOrEqual(7000);
        expect(result.doneAtMs).toBeLessThanOrEqual(MAX_TOTAL_MS);
      }),
      { numRuns: 64, seed: FC_SEED, path: FC_PATH },
    );
  });

  /**
   * **Property 33: Reveal Slam After Analysis-Min**
   *
   * The `slam` phase fires no earlier than `ANALYSIS_MIN_MS` (6500 ms)
   * regardless of how early the response arrives. This guarantees the
   * cinematic minimum hold from Requirement 4.3 even when the API returns
   * at t = 0.
   *
   * Validates: Requirements 4.3, 4.4
   */
  test("Property 33: slam fires no earlier than ANALYSIS_MIN_MS", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const result = await runScenario(s);
        expectReachedDone(result);
        const slam = result.phases.find((p) => p.phase === "slam");
        expect(slam).toBeDefined();
        expect(slam!.ctx.elapsedMs).toBeGreaterThanOrEqual(ANALYSIS_MIN_MS);
      }),
      { numRuns: 64, seed: FC_SEED, path: FC_PATH },
    );
  });

  /**
   * **Property 34: Reveal Order**
   *
   * Phases emit in the documented FSM order — `lockOn → scanSweep →
   * analysis → slam → reveal → done` — every phase is emitted exactly
   * once, and the elapsed timestamps are strictly non-decreasing.
   *
   * The controller owns the phase boundary; the consumer renders the
   * Score → Tier → Core → Category → Commentary order *inside* the
   * `reveal` window. The controller-level guarantee here (one entry per
   * phase, monotonic elapsed) is the precondition that makes Requirement
   * 4.7's per-element ordering implementable.
   *
   * Validates: Requirements 4.6, 4.7
   */
  test("Property 34: phases emit in FSM order, exactly once, monotonically", async () => {
    const expectedOrder: RevealPhase[] = [
      "lockOn",
      "scanSweep",
      "analysis",
      "slam",
      "reveal",
      "done",
    ];
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const result = await runScenario(s);
        expectReachedDone(result);
        const seen = result.phases.map((p) => p.phase);
        expect(seen).toEqual(expectedOrder);

        // Elapsed-ms across emissions must be non-decreasing — no phase
        // ever observes a clock value earlier than its predecessor.
        for (let i = 1; i < result.phases.length; i++) {
          expect(result.phases[i].ctx.elapsedMs).toBeGreaterThanOrEqual(
            result.phases[i - 1].ctx.elapsedMs,
          );
        }

        // Slam ↔ reveal ↔ done spacing matches the configured phase
        // durations (within one tick of scheduler lag). This anchors the
        // ordering property to the actual time budget so a rewrite that
        // shrinks `SLAM_DURATION_MS` or `REVEAL_DURATION_MS` while
        // preserving order still trips this check.
        const slam = result.phases.find((p) => p.phase === "slam")!;
        const reveal = result.phases.find((p) => p.phase === "reveal")!;
        const done = result.phases.find((p) => p.phase === "done")!;
        expect(reveal.ctx.elapsedMs - slam.ctx.elapsedMs).toBeGreaterThanOrEqual(
          SLAM_DURATION_MS,
        );
        expect(reveal.ctx.elapsedMs - slam.ctx.elapsedMs).toBeLessThan(
          SLAM_DURATION_MS + TICK_MS * 2,
        );
        expect(done.ctx.elapsedMs - reveal.ctx.elapsedMs).toBeGreaterThanOrEqual(
          REVEAL_DURATION_MS,
        );
        expect(done.ctx.elapsedMs - reveal.ctx.elapsedMs).toBeLessThan(
          REVEAL_DURATION_MS + TICK_MS * 2,
        );
      }),
      { numRuns: 64, seed: FC_SEED, path: FC_PATH },
    );
  });

  /**
   * **Property 35: Reduced-Motion Preserves Order**
   *
   * Toggling `reducedMotion` on does not change the phase sequence or the
   * `done` timestamp — only the *consumer's* rendering primitive (cross-fade
   * vs spring) is expected to change downstream. The controller's
   * responsibility (Requirement 4.10 / 12.15) is to forward the flag on
   * every emission so consumers can route through `withReducedMotion`.
   *
   * The property runs each scenario twice — once with the flag off, once
   * on — against the identical response timing and asserts the timeline
   * is byte-identical and that `ctx.reducedMotion` mirrors the input on
   * every emission.
   *
   * Validates: Requirements 4.10, 12.15
   */
  test("Property 35: reducedMotion preserves order and done time, flag is forwarded", async () => {
    const baseArb = fc.record({
      responseAt: responseAtArb,
      variant: variantArb,
    });
    await fc.assert(
      fc.asyncProperty(baseArb, async ({ responseAt, variant }) => {
        const standard = await runScenario({
          responseAt,
          variant,
          reducedMotion: false,
        });
        const reduced = await runScenario({
          responseAt,
          variant,
          reducedMotion: true,
        });
        expectReachedDone(standard);
        expectReachedDone(reduced);

        // Same FSM phase sequence under both motion paths.
        expect(reduced.phases.map((p) => p.phase)).toEqual(
          standard.phases.map((p) => p.phase),
        );
        // Same `done` wall-clock time — reduced motion does not alter the
        // total reveal envelope.
        expect(reduced.doneAtMs).toBe(standard.doneAtMs);

        // The flag must be forwarded on every emission so the consumer
        // can route their motion presets through `withReducedMotion`.
        for (const { ctx } of reduced.phases) {
          expect(ctx.reducedMotion).toBe(true);
        }
        for (const { ctx } of standard.phases) {
          expect(ctx.reducedMotion).toBe(false);
        }
      }),
      { numRuns: 32, seed: FC_SEED, path: FC_PATH },
    );
  });

  /**
   * **Property 36: Reveal Variant Determinism**
   *
   * When the response promise resolves before `SLAM_DEADLINE_MS` (i.e.
   * inside the analysis budget), the variant emitted on `slam` and every
   * subsequent phase equals `response.reveal.revealVariant`, and
   * `ctx.source === 'response'`.
   *
   * When the response is missing past the deadline (or never arrives), the
   * controller latches `FALLBACK_REVEAL_VARIANT` (`scouter_failure`) and
   * tags `ctx.source === 'fallback'`, satisfying Requirement 4.5.
   *
   * Validates: Requirements 7.1, 7.2
   */
  test("Property 36: slam variant equals the in-budget response variant; falls back past deadline", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const result = await runScenario(s);
        expectReachedDone(result);
        const slam = result.phases.find((p) => p.phase === "slam")!;

        const inBudget =
          s.responseAt !== null && s.responseAt < SLAM_DEADLINE_MS;

        if (inBudget) {
          expect(slam.ctx.revealVariant).toBe(s.variant);
          expect(slam.ctx.source).toBe("response");
        } else {
          expect(slam.ctx.revealVariant).toBe(FALLBACK_REVEAL_VARIANT);
          expect(slam.ctx.source).toBe("fallback");
        }

        // The variant locked at slam must persist through every later
        // emission — the FSM never re-decides the variant after slam.
        const slamIdx = result.phases.findIndex((p) => p.phase === "slam");
        for (let i = slamIdx; i < result.phases.length; i++) {
          expect(result.phases[i].ctx.revealVariant).toBe(
            slam.ctx.revealVariant,
          );
          expect(result.phases[i].ctx.source).toBe(slam.ctx.source);
        }
      }),
      { numRuns: 64, seed: FC_SEED, path: FC_PATH },
    );
  });
});

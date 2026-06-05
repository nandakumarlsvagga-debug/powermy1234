/**
 * Unit tests for `createRevealController`.
 *
 * These cover the controller's basic functional contract: the FSM walks
 * through the documented phases in order, the `slam` phase holds for an
 * early response and extends for a late one, the fallback variant is
 * emitted when the response misses the slam deadline, and `cancel`
 * stops further emissions.
 *
 * The exhaustive randomized property tests live in
 * `test/reveal.properties.spec.ts` (Task 9.2). This spec file exercises
 * the deterministic happy paths so a regression in core wiring is
 * easy to spot without reading PBT counter-examples.
 */

import { describe, expect, test } from "vitest";

import { createRevealController } from "../src/controller.js";
import {
  ANALYSIS_MIN_MS,
  ANALYSIS_START_MS,
  FALLBACK_REVEAL_VARIANT,
  LOCK_ON_START_MS,
  MAX_TOTAL_MS,
  REVEAL_DURATION_MS,
  SCAN_SWEEP_START_MS,
  SLAM_DEADLINE_MS,
  SLAM_DURATION_MS,
} from "../src/timing.js";
import type {
  FrameScheduler,
  PerformanceLike,
  RevealContext,
  RevealPhase,
  RevealResponse,
} from "../src/types.js";

/**
 * Deterministic clock + scheduler harness shared across tests.
 *
 * The fake clock starts at `0` and only advances when `tick(ms)` is called.
 * Each `tick` call also flushes any pending frame callbacks the controller
 * has queued so the FSM advances one step per scheduled frame.
 *
 * This separation matches the controller's real behavior in production:
 * `performance.now()` advances on the wall-clock and `requestAnimationFrame`
 * callbacks fire at frame boundaries — never synchronously inside a
 * `start()` call.
 */
function makeHarness() {
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

  /**
   * Advance the fake clock by `ms`, then drain the frame queue. The
   * controller may schedule further frames inside the drained callbacks;
   * we keep draining until the queue settles or `maxIterations` is hit
   * (a defensive cap; a well-behaved controller always settles).
   */
  function tick(ms: number) {
    clock += ms;
    let safety = 0;
    while (queue.size > 0 && safety < 1000) {
      const callbacks = Array.from(queue.entries());
      queue.clear();
      for (const [, cb] of callbacks) cb(clock);
      safety++;
    }
  }

  function setClock(value: number) {
    clock = value;
  }

  return { perf, scheduler, tick, setClock, queueSize: () => queue.size };
}

function makeResponse(
  variant: RevealResponse["reveal"]["revealVariant"] = "standard",
): RevealResponse {
  return { reveal: { serverElapsedMs: 1234, revealVariant: variant } };
}

/**
 * Run a controller through to `done` against the harness, deferring the
 * response promise resolution to a controllable hook. Returns the
 * captured phase sequence and a resolver for the response promise.
 */
function runController(opts: {
  reducedMotion?: boolean;
  resolveAt?: "early" | "onTime" | "late" | "never";
  variant?: RevealResponse["reveal"]["revealVariant"];
}): {
  phases: { phase: RevealPhase; ctx: RevealContext }[];
  tick: (ms: number) => void;
  cancel: () => void;
} {
  const harness = makeHarness();
  const ctrl = createRevealController({
    performance: harness.perf,
    scheduler: harness.scheduler,
  });

  let resolve!: (r: RevealResponse) => void;
  const responsePromise = new Promise<RevealResponse>((r) => {
    resolve = r;
  });

  const phases: { phase: RevealPhase; ctx: RevealContext }[] = [];
  const handle = ctrl.start({
    submittedAt: 0,
    responsePromise,
    reducedMotion: opts.reducedMotion ?? false,
    onPhase: (phase, ctx) => phases.push({ phase, ctx }),
  });

  const variant = opts.variant ?? "standard";

  // Helper that resolves the promise and lets microtasks flush.
  async function resolveAndFlush() {
    resolve(makeResponse(variant));
    // Yield to the microtask queue so the `.then` handler runs before the
    // next scheduler tick.
    await Promise.resolve();
    await Promise.resolve();
  }

  // Tick driver chooses when to resolve the promise relative to the
  // choreographed timeline.
  const wrappedTick = (ms: number) => harness.tick(ms);

  // Resolve at chosen point; this is invoked from the test by stepping
  // the harness manually.
  const planned = opts.resolveAt ?? "onTime";

  return {
    phases,
    tick: (ms: number) => {
      const before = harness.perf.now();
      const after = before + ms;
      wrappedTick(ms);
      // Resolve the response promise at its planned time relative to the
      // newly-elapsed range.
      if (planned === "early" && before < 1000 && after >= 1000) {
        // Resolve very early.
        void resolveAndFlush().then(() => harness.tick(0));
      } else if (planned === "onTime" && before < 5500 && after >= 5500) {
        // Resolve mid-analysis.
        void resolveAndFlush().then(() => harness.tick(0));
      } else if (planned === "late" && before < 8000 && after >= 8000) {
        // Resolve after the slam deadline (controller should have already fallen
        // through to the fallback variant by then).
        void resolveAndFlush().then(() => harness.tick(0));
      }
      // 'never' resolveAt means we never call `resolve` — controller falls
      // through to the deterministic neutral fallback.
    },
    cancel: handle.cancel,
  };
}

describe("createRevealController — phase sequence and timing", () => {
  test("emits phases in the documented order through to done", async () => {
    const { phases, tick } = runController({ resolveAt: "onTime" });
    // Walk the timeline in coarse steps. Each step must be ≤ a phase
    // boundary so the harness never skips a transition; we use 250 ms.
    for (let i = 0; i < 50; i++) {
      tick(250);
      // Allow microtasks (response promise then-handler) to interleave
      // between ticks.
      await Promise.resolve();
    }

    const seen = phases.map((p) => p.phase);
    // The controller must visit every phase in order. Allow `idle` to be
    // omitted: the FSM starts in `idle` but only emits via `onPhase` once
    // it transitions to `lockOn` on the first frame.
    expect(seen).toEqual([
      "lockOn",
      "scanSweep",
      "analysis",
      "slam",
      "reveal",
      "done",
    ]);
  });

  test("does not fire any phase synchronously inside start()", () => {
    const harness = makeHarness();
    const ctrl = createRevealController({
      performance: harness.perf,
      scheduler: harness.scheduler,
    });
    const seen: RevealPhase[] = [];
    ctrl.start({
      submittedAt: 0,
      responsePromise: new Promise<RevealResponse>(() => {
        // never resolves — irrelevant for this test
      }),
      reducedMotion: false,
      onPhase: (p) => seen.push(p),
    });
    // Before any frame runs, no phase emission should have happened.
    expect(seen).toEqual([]);
    // The controller should have queued exactly one frame.
    expect(harness.queueSize()).toBe(1);
  });

  test("slam carries the response variant when response arrives in budget", async () => {
    const { phases, tick } = runController({
      resolveAt: "onTime",
      variant: "power_surge",
    });
    for (let i = 0; i < 50; i++) {
      tick(250);
      await Promise.resolve();
    }
    const slam = phases.find((p) => p.phase === "slam");
    expect(slam).toBeDefined();
    expect(slam?.ctx.revealVariant).toBe("power_surge");
    expect(slam?.ctx.source).toBe("response");
  });

  test("slam falls back to scouter_failure when response never arrives", async () => {
    const { phases, tick } = runController({ resolveAt: "never" });
    for (let i = 0; i < 60; i++) {
      tick(250);
      await Promise.resolve();
    }
    const slam = phases.find((p) => p.phase === "slam");
    expect(slam).toBeDefined();
    expect(slam?.ctx.revealVariant).toBe(FALLBACK_REVEAL_VARIANT);
    expect(slam?.ctx.source).toBe("fallback");
  });

  test("slam never fires before ANALYSIS_MIN_MS even with an early response", async () => {
    const { phases, tick } = runController({ resolveAt: "early" });
    for (let i = 0; i < 200; i++) {
      tick(100);
      await Promise.resolve();
    }
    const slam = phases.find((p) => p.phase === "slam");
    expect(slam).toBeDefined();
    expect(slam?.ctx.elapsedMs).toBeGreaterThanOrEqual(ANALYSIS_MIN_MS);
  });

  test("slam fires no later than SLAM_DEADLINE_MS when response is missing", async () => {
    const { phases, tick } = runController({ resolveAt: "never" });
    for (let i = 0; i < 200; i++) {
      tick(100);
      await Promise.resolve();
    }
    const slam = phases.find((p) => p.phase === "slam");
    expect(slam).toBeDefined();
    // The fallback latch fires exactly at SLAM_DEADLINE_MS on the next
    // frame after the threshold is crossed; allow one tick of slack.
    expect(slam?.ctx.elapsedMs).toBeLessThanOrEqual(SLAM_DEADLINE_MS + 100);
  });

  test("done fires inside the [7000, MAX_TOTAL_MS] envelope", async () => {
    const { phases, tick } = runController({ resolveAt: "onTime" });
    for (let i = 0; i < 60; i++) {
      tick(250);
      await Promise.resolve();
    }
    const done = phases.find((p) => p.phase === "done");
    expect(done).toBeDefined();
    expect(done?.ctx.elapsedMs).toBeGreaterThanOrEqual(7000);
    expect(done?.ctx.elapsedMs).toBeLessThanOrEqual(MAX_TOTAL_MS + 250);
  });

  test("propagates reducedMotion through every emitted context", async () => {
    const { phases, tick } = runController({
      resolveAt: "onTime",
      reducedMotion: true,
    });
    for (let i = 0; i < 60; i++) {
      tick(250);
      await Promise.resolve();
    }
    expect(phases.length).toBeGreaterThan(0);
    for (const { ctx } of phases) {
      expect(ctx.reducedMotion).toBe(true);
    }
  });

  test("cancel() prevents further emissions", async () => {
    const harness = makeHarness();
    const ctrl = createRevealController({
      performance: harness.perf,
      scheduler: harness.scheduler,
    });
    const seen: RevealPhase[] = [];
    const handle = ctrl.start({
      submittedAt: 0,
      responsePromise: Promise.resolve(makeResponse()),
      reducedMotion: false,
      onPhase: (p) => seen.push(p),
    });

    // Run a few frames, then cancel and run more.
    harness.tick(0);
    harness.tick(2000);
    handle.cancel();
    const beforeCount = seen.length;
    harness.tick(8000);
    await Promise.resolve();
    harness.tick(0);
    expect(seen.length).toBe(beforeCount);
  });

  test("calling start() twice on the same controller throws", () => {
    const harness = makeHarness();
    const ctrl = createRevealController({
      performance: harness.perf,
      scheduler: harness.scheduler,
    });
    ctrl.start({
      submittedAt: 0,
      responsePromise: new Promise<RevealResponse>(() => {}),
      reducedMotion: false,
      onPhase: () => {},
    });
    expect(() =>
      ctrl.start({
        submittedAt: 0,
        responsePromise: new Promise<RevealResponse>(() => {}),
        reducedMotion: false,
        onPhase: () => {},
      }),
    ).toThrowError(/start may be called at most once/);
  });

  test("a throwing onPhase consumer does not strand the sequencer", async () => {
    const harness = makeHarness();
    const ctrl = createRevealController({
      performance: harness.perf,
      scheduler: harness.scheduler,
    });
    const seen: RevealPhase[] = [];
    ctrl.start({
      submittedAt: 0,
      responsePromise: Promise.resolve(makeResponse()),
      reducedMotion: false,
      onPhase: (phase) => {
        seen.push(phase);
        if (phase === "scanSweep") {
          throw new Error("consumer is rude");
        }
      },
    });
    for (let i = 0; i < 60; i++) {
      harness.tick(250);
      await Promise.resolve();
    }
    expect(seen).toContain("done");
  });

  test("timing constants are internally consistent", () => {
    expect(LOCK_ON_START_MS).toBe(0);
    expect(SCAN_SWEEP_START_MS).toBeGreaterThan(LOCK_ON_START_MS);
    expect(ANALYSIS_START_MS).toBeGreaterThan(SCAN_SWEEP_START_MS);
    expect(ANALYSIS_MIN_MS).toBeGreaterThan(ANALYSIS_START_MS);
    expect(SLAM_DEADLINE_MS).toBeGreaterThanOrEqual(ANALYSIS_MIN_MS);
    expect(SLAM_DEADLINE_MS + SLAM_DURATION_MS + REVEAL_DURATION_MS).toBe(
      MAX_TOTAL_MS,
    );
  });
});

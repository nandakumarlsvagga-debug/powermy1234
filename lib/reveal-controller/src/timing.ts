/**
 * Reveal timing constants — the canonical timeline drawn from
 * Requirements 4.1–4.10 and the "Reveal Sync" section of the design doc.
 *
 * All values are in milliseconds elapsed since the user pressed submit
 * (`submittedAt` in `RevealStartOptions`).
 *
 *  t = 0            submit pressed → enter `lockOn`
 *  t = 1500         enter `scanSweep`
 *  t = 4500         enter `analysis`
 *  t ≥ 6500         enter `slam` if response is ready (Req 4.3, 4.6)
 *  t = 7000         enter `slam` even without response → fallback (Req 4.4, 4.5)
 *  +500             `reveal` (sequential element appearance, Req 4.7)
 *  +2500            `done` (Result Screen idle)
 *
 * The total reveal envelope is `[7000, 10000] ms` (Requirement 4.2).
 *
 * The analysis hold/extension window is bounded by the absolute
 * `MAX_TOTAL_MS = 10000` envelope. Concretely the slam latch
 * (`SLAM_DEADLINE_MS`) is computed as
 * `MAX_TOTAL_MS - SLAM_DURATION_MS - REVEAL_DURATION_MS = 7000` so the
 * controller never blows past 10000 ms wall-clock to `done` even when
 * the response is missing — past `SLAM_DEADLINE_MS` the controller
 * latches the variant to `scouter_failure` and proceeds (Property 32).
 */

/** When the lock-on phase starts (immediately on submit). */
export const LOCK_ON_START_MS = 0;

/** When the scan-sweep phase starts. */
export const SCAN_SWEEP_START_MS = 1500;

/** When the analysis phase starts. */
export const ANALYSIS_START_MS = 4500;

/**
 * Minimum elapsed time before `slam` may fire. The choreographed slam
 * never lands earlier than this even if the API response arrives at
 * t = 0 (Requirement 4.3). Verified by Property 33.
 */
export const ANALYSIS_MIN_MS = 6500;

/** Duration of the `slam` phase. Mirrors `DURATIONS.revealSlam` (0.5 s). */
export const SLAM_DURATION_MS = 500;

/**
 * Duration of the sequential `reveal` phase: tier badge → core stats →
 * category stats → commentary. Mirrors `DURATIONS.revealSequence` (2.5 s).
 * The Score-first ordering required by Requirement 4.7 is preserved by
 * the consumer; the controller only owns the phase boundary, not the
 * per-element timing inside it.
 */
export const REVEAL_DURATION_MS = 2500;

/**
 * Hard ceiling on the total reveal envelope (Requirement 4.2). Total
 * wall-clock time from `lockOn` to `done` is in `[7000, 10000] ms`.
 *
 * The minimum is reached when the response arrives at or before
 * `ANALYSIS_MIN_MS` and slam fires at exactly `ANALYSIS_MIN_MS`
 * (`6500 + 500 + 2500 = 9500 ms`). The maximum is reached when the
 * response misses the analysis envelope and the slam latch fires at
 * `SLAM_DEADLINE_MS = 7000 ms` (`7000 + 500 + 2500 = 10000 ms`).
 */
export const MAX_TOTAL_MS = 10000;

/**
 * Latest moment at which the slam phase may fire. Computed so that the
 * subsequent slam + reveal phases still complete inside `MAX_TOTAL_MS`.
 * If the API response has not arrived by this point the controller
 * latches the fallback variant (`scouter_failure`) and emits the slam
 * anyway (Requirements 4.4, 4.5). Verified by Property 32.
 */
export const SLAM_DEADLINE_MS =
  MAX_TOTAL_MS - SLAM_DURATION_MS - REVEAL_DURATION_MS;

/**
 * The fallback variant emitted when the response misses the analysis
 * envelope. Held as a constant rather than a hard-coded string so
 * callers and tests can import the same symbol the controller emits.
 */
export const FALLBACK_REVEAL_VARIANT = "scouter_failure" as const;

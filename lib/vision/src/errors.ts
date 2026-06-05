/**
 * Errors thrown by the Vision Adapter (`@workspace/vision`).
 *
 * The orchestrator (task 8.7) maps these to `SCOUTER_FAILURE`-style
 * fallbacks per Requirement 5.7 / 5.8 (retry on parse failure; on
 * second failure, neutral fallback). The API server pipeline (task
 * 11.3) ultimately surfaces them as `VISION_UNAVAILABLE` ApiErrors
 * when the orchestrator chooses to propagate them.
 *
 * Distinguished from a slop-detector rejection, which is a normal
 * `{ ok: false, reason }` value, not a thrown error.
 */

/**
 * Reason discriminator for `VisionUnavailableError`.
 *
 * - `sdk_error` — the Bedrock SDK call rejected with a transport-,
 *   auth-, or service-level error.
 * - `timeout` — the per-call budget (default 4 000 ms) elapsed.
 * - `parse_error` — the Bedrock response could not be parsed as the
 *   required structured JSON, OR a required field was missing or
 *   out-of-range (e.g. trait confidence outside `[1, 10]`). The
 *   orchestrator retries once on this case (Requirement 5.7).
 * - `unsupported_format` — the request's `imageMediaType` is not in
 *   the set Bedrock Converse accepts (`jpeg`, `png`, `webp`, `gif`).
 *   This is a programming error from the orchestrator, not a model
 *   condition; it is surfaced as the same error class so callers can
 *   handle it uniformly.
 */
export type VisionUnavailableReason =
  | "sdk_error"
  | "timeout"
  | "parse_error"
  | "unsupported_format";

/**
 * Thrown by the Bedrock adapter when the call cannot be completed or
 * the response cannot be coerced into the contract `BedrockResponse`.
 *
 * Carries a structured `reason` so the orchestrator can decide
 * retry-vs-fallback policy without parsing strings.
 */
export class VisionUnavailableError extends Error {
  readonly name = "VisionUnavailableError";
  readonly reason: VisionUnavailableReason;

  constructor(
    reason: VisionUnavailableReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.reason = reason;
  }
}

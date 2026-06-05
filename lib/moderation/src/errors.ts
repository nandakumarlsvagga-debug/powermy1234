/**
 * Thrown when the moderation service is unreachable, errors out, or exceeds
 * the per-call timeout. Callers (the API server pipeline) map this to the
 * `MODERATION_UNAVAILABLE` ApiError code.
 *
 * Distinguished from a "moderation rejected" verdict (which is a normal
 * `{ ok: false, flaggedLabels }` return value, not an error).
 */
export class ModerationUnavailableError extends Error {
  readonly name = "ModerationUnavailableError";
  /** "timeout" when the 3 s budget elapsed; "sdk_error" for any SDK failure. */
  readonly reason: "timeout" | "sdk_error";

  constructor(
    reason: "timeout" | "sdk_error",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.reason = reason;
  }
}

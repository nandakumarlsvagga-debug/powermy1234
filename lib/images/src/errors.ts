export type ImageInvalidReason =
  | "size"
  | "format"
  | "dimensions"
  | "mime_mismatch";

/**
 * Typed error thrown by `processImage` when the supplied bytes fail
 * validation. Callers map `reason` onto the API surface's
 * `IMAGE_INVALID { reason }` discriminator.
 */
export class ImageInvalidError extends Error {
  public readonly reason: ImageInvalidReason;

  constructor(
    reason: ImageInvalidReason,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? `Image rejected: ${reason}`, options);
    this.name = "ImageInvalidError";
    this.reason = reason;
    // Restore prototype chain when targeting older runtimes.
    Object.setPrototypeOf(this, ImageInvalidError.prototype);
  }
}

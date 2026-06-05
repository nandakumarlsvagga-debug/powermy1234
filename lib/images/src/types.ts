/**
 * Output of {@link processImage}. The processed image is the bytes that
 * should be persisted to Storage; the thumbnail is the small WebP variant
 * used in Feed/Leaderboard rendering. The perceptual hash is a hex string
 * derived from an 8×8 DCT of the decoded image and is used as the
 * deterministic neutral-fallback seed by the scoring/anomaly engines.
 */
export interface ProcessedImage {
  processed: Buffer;
  thumbnail: Buffer;
  perceptualHash: string;
  format: "avif" | "webp";
  width: number;
  height: number;
}

/**
 * Sniffed image format identifier. Mirrors the format set the
 * spec accepts: {JPEG, PNG, HEIC, WebP}.
 */
export type SniffedFormat = "jpeg" | "png" | "heic" | "webp";

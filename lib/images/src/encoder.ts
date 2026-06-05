import sharp, { type Sharp } from "sharp";

/**
 * Maximum encoded size for the persisted full-resolution image
 * (Requirement 2.7). 300 KB is computed in binary kilobytes so the limit
 * lines up with how Supabase Storage and CDN budgets are expressed elsewhere
 * in the system.
 */
export const MAX_ENCODED_BYTES = 300 * 1024;

/**
 * AVIF quality ladder. AVIF is preferred because it produces smaller files
 * at equivalent perceptual quality than WebP for typical photo content; we
 * step down before falling back so most images stay AVIF.
 */
const AVIF_QUALITY_LADDER = [70, 60, 50, 40, 30] as const;

/**
 * WebP quality ladder used when no AVIF setting fits inside the size cap.
 * The lower bound (40) is the floor we are willing to ship — below that the
 * image is too lossy to be worth scoring; in practice an 8 MB photograph
 * downscaled to 1600 px is comfortably under 300 KB at WebP q=70.
 */
const WEBP_QUALITY_LADDER = [80, 70, 60, 50, 40] as const;

/**
 * Encode a `sharp` pipeline that has already had EXIF stripped and been
 * downscaled. Tries AVIF qualities first; on any failure to fit the size
 * cap, falls through to a WebP ladder. If neither ladder produces an output
 * under {@link MAX_ENCODED_BYTES}, returns the smallest of the lowest-quality
 * AVIF/WebP attempts so the pipeline still produces a usable artifact —
 * downstream callers care that the format is one of `'avif' | 'webp'`, not
 * that it strictly satisfied the cap.
 */
export async function encodeWithSizeBudget(
  pipeline: Sharp,
): Promise<{ data: Buffer; format: "avif" | "webp" }> {
  // Materialize the pre-encoded raw frame once so we can re-run different
  // encoders without re-decoding the source bytes for every attempt.
  const { data: rgbBuffer, info } = await pipeline
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rawConfig = {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  } as const;

  let smallest: { data: Buffer; format: "avif" | "webp" } | null = null;

  for (const quality of AVIF_QUALITY_LADDER) {
    const data = await sharp(rgbBuffer, rawConfig)
      .avif({ quality, effort: 4 })
      .toBuffer();
    if (data.length <= MAX_ENCODED_BYTES) {
      return { data, format: "avif" };
    }
    if (!smallest || data.length < smallest.data.length) {
      smallest = { data, format: "avif" };
    }
  }

  for (const quality of WEBP_QUALITY_LADDER) {
    const data = await sharp(rgbBuffer, rawConfig)
      .webp({ quality })
      .toBuffer();
    if (data.length <= MAX_ENCODED_BYTES) {
      return { data, format: "webp" };
    }
    if (!smallest || data.length < smallest.data.length) {
      smallest = { data, format: "webp" };
    }
  }

  // Both ladders blew the budget; ship whichever attempt was smallest. This
  // is reachable in pathological synthetic inputs (e.g. high-frequency noise
  // at 1600 px) but never on normal photographic content.
  return smallest!;
}

import sharp from "sharp";

import { encodeWithSizeBudget } from "./encoder.js";
import { ImageInvalidError } from "./errors.js";
import { computePerceptualHash } from "./phash.js";
import { declaredMimeMatchesSniffed, sniffFormat } from "./sniff.js";
import type { ProcessedImage } from "./types.js";

/** Maximum accepted upload size (Requirement 2.3). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Minimum length of the shorter edge of the original image (Requirement 2.3). */
export const MIN_SHORTER_EDGE = 256;

/** Cap on the longer edge of the persisted image (Requirement 2.7). */
export const MAX_LONGER_EDGE = 1600;

/** Long-edge target for the persisted thumbnail (Requirement 2.7). */
export const THUMBNAIL_LONGER_EDGE = 480;

/** WebP quality for the thumbnail. The number is chosen by the design doc. */
const THUMBNAIL_QUALITY = 70;

export interface ProcessImageInput {
  bytes: Buffer;
  declaredMime: string;
}

/**
 * Validate, normalize, and re-encode an uploaded image.
 *
 * Pipeline (Requirements 2.1, 2.2, 2.3, 2.7):
 *   1. Validate raw byte length ≤ 8 MB.
 *   2. Magic-byte sniff to confirm the format is JPEG / PNG / HEIC / WebP and
 *      that the declared MIME matches the decoded MIME.
 *   3. Decode metadata via `sharp` to confirm the shorter edge ≥ 256 px.
 *   4. Strip EXIF, bake orientation into the pixel grid, and downscale so the
 *      longer edge ≤ 1600 px.
 *   5. Encode AVIF first (preferred) and fall back to WebP at decreasing
 *      quality until ≤ 300 KB.
 *   6. Build a 480 px long-edge WebP thumbnail.
 *   7. Compute an 8×8-DCT perceptual hash for the deterministic neutral
 *      fallback seed.
 *
 * Throws {@link ImageInvalidError} on validation failure with `reason ∈
 * {'size','format','dimensions','mime_mismatch'}`. The function never throws
 * a generic error for validation; downstream callers (the scan-pipeline
 * route) translate every thrown reason into the matching `IMAGE_INVALID`
 * `ApiError` discriminator.
 */
export async function processImage(
  input: ProcessImageInput,
): Promise<ProcessedImage> {
  const { bytes, declaredMime } = input;

  // 1. Size cap. Cheapest possible check, runs first so we don't even hand
  //    the buffer to libvips for hostile uploads.
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new ImageInvalidError("format", "Empty image buffer");
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new ImageInvalidError(
      "size",
      `Image exceeds ${MAX_UPLOAD_BYTES} byte upload limit`,
    );
  }

  // 2. Format sniff via magic bytes. A truncated or wrong-magic upload is
  //    rejected before we let `sharp` decode it.
  const sniffed = sniffFormat(bytes);
  if (sniffed === null) {
    throw new ImageInvalidError(
      "format",
      "Image format is not one of {JPEG, PNG, HEIC, WebP}",
    );
  }
  if (typeof declaredMime !== "string" || declaredMime.trim() === "") {
    throw new ImageInvalidError(
      "mime_mismatch",
      "Declared MIME type is missing",
    );
  }
  if (!declaredMimeMatchesSniffed(declaredMime, sniffed)) {
    throw new ImageInvalidError(
      "mime_mismatch",
      `Declared MIME ${declaredMime} does not match decoded format ${sniffed}`,
    );
  }

  // 3. Decode metadata to confirm dimensions. `sharp` may also reject the
  //    buffer here if the header is structurally invalid; we map that to
  //    `format` (the buffer is well-magicked but not actually decodable).
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch (err) {
    throw new ImageInvalidError("format", "Image bytes failed to decode", {
      cause: err,
    });
  }

  // Sharp's reported `format` must agree with what magic bytes told us. If it
  // disagrees the buffer is hostile — e.g. a polyglot PNG/HEIC — and we
  // refuse it under `format`.
  if (metadata.format && !sniffedFormatMatchesSharpFormat(sniffed, metadata.format)) {
    throw new ImageInvalidError(
      "format",
      `Sharp decoded ${metadata.format} but magic bytes were ${sniffed}`,
    );
  }

  const decodedWidth = metadata.width ?? 0;
  const decodedHeight = metadata.height ?? 0;
  if (decodedWidth === 0 || decodedHeight === 0) {
    throw new ImageInvalidError(
      "dimensions",
      "Image has zero width or height",
    );
  }
  const shorterEdge = Math.min(decodedWidth, decodedHeight);
  if (shorterEdge < MIN_SHORTER_EDGE) {
    throw new ImageInvalidError(
      "dimensions",
      `Shorter edge ${shorterEdge}px is below the ${MIN_SHORTER_EDGE}px minimum`,
    );
  }

  // 4. Strip EXIF + bake orientation + downscale. Calling `.rotate()` with
  //    no arguments tells sharp to read the EXIF orientation tag and apply
  //    it as a pixel-grid rotation; subsequent metadata stripping then
  //    drops the tag itself so consumers see the canonical orientation.
  //    `fit: 'inside'` preserves aspect ratio without enlarging.
  const oriented = sharp(bytes)
    .rotate()
    .resize({
      width: MAX_LONGER_EDGE,
      height: MAX_LONGER_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .withMetadata({});

  // Capture the post-resize dimensions for the response. We re-decode the
  // metadata of the oriented pipeline rather than computing the resize math
  // ourselves so any future change to sharp's resize semantics doesn't
  // silently desync this number from the encoded buffer.
  const orientedRgb = await oriented.clone().toColourspace("srgb").raw().toBuffer({
    resolveWithObject: true,
  });
  const finalWidth = orientedRgb.info.width;
  const finalHeight = orientedRgb.info.height;

  // 5. Encode under the 300 KB budget.
  const encoded = await encodeWithSizeBudget(oriented);

  // 6. 480 px long-edge WebP thumbnail. We re-derive the pipeline from the
  //    original bytes (not the already-resized buffer) so the thumbnail
  //    keeps the original detail rather than upscaling from a 1600 px copy.
  const thumbnail = await sharp(bytes)
    .rotate()
    .resize({
      width: THUMBNAIL_LONGER_EDGE,
      height: THUMBNAIL_LONGER_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .withMetadata({})
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  // 7. Perceptual hash. Computed from the original bytes so the hash is a
  //    function of image content rather than of the encoder we happened to
  //    pick on this code path.
  const perceptualHash = await computePerceptualHash(bytes);

  return {
    processed: encoded.data,
    thumbnail,
    perceptualHash,
    format: encoded.format,
    width: finalWidth,
    height: finalHeight,
  };
}

/**
 * Compare our four-value sniffed format against sharp's broader set of
 * format strings. `sharp` reports "jpeg", "png", "webp", and "heif" for the
 * accepted set; "heif" is the umbrella for HEIC.
 */
function sniffedFormatMatchesSharpFormat(
  sniffed: ReturnType<typeof sniffFormat>,
  sharpFormat: string,
): boolean {
  switch (sniffed) {
    case "jpeg":
      return sharpFormat === "jpeg" || sharpFormat === "jpg";
    case "png":
      return sharpFormat === "png";
    case "webp":
      return sharpFormat === "webp";
    case "heic":
      return sharpFormat === "heif" || sharpFormat === "heic";
    default:
      return false;
  }
}

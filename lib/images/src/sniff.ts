import type { SniffedFormat } from "./types.js";

/**
 * Inspects the first ~16 bytes of an image buffer and returns the
 * sniffed format. Only the four formats POWERLVL accepts are
 * recognised; everything else returns `null`.
 *
 * The detection is intentionally narrow: signatures are checked at
 * exact byte offsets rather than using a permissive search, so a
 * truncated or mislabelled buffer cannot slip through.
 */
export function sniffFormat(bytes: Buffer): SniffedFormat | null {
  if (bytes.length < 12) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  // JPEG: starts FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  // RIFF container — could be WebP. Bytes 0..3 = "RIFF", 8..11 = "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  // HEIC/HEIF: ISO BMFF container. Bytes 4..7 = "ftyp", brand at 8..11.
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = bytes.subarray(8, 12).toString("ascii");
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "hevc" ||
      brand === "hevx" ||
      brand === "heim" ||
      brand === "heis" ||
      brand === "hevm" ||
      brand === "hevs" ||
      brand === "mif1" ||
      brand === "msf1"
    ) {
      return "heic";
    }
  }

  return null;
}

/**
 * Canonical MIME types accepted for each sniffed format. Used to
 * compare against the caller-declared MIME so a JPEG declared as
 * `image/png` is rejected even when the magic bytes pass.
 */
const ACCEPTED_MIMES: Record<SniffedFormat, ReadonlyArray<string>> = {
  jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"],
};

/**
 * Returns true when the caller-declared MIME is consistent with the
 * sniffed format. Comparison is case-insensitive and ignores trailing
 * parameters (e.g. `; charset=…`).
 */
export function declaredMimeMatchesSniffed(
  declaredMime: string,
  sniffed: SniffedFormat,
): boolean {
  const normalised = declaredMime.split(";")[0]!.trim().toLowerCase();
  return ACCEPTED_MIMES[sniffed].includes(normalised);
}

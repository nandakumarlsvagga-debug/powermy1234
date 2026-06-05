import { describe, expect, it, beforeAll } from "vitest";
import sharp from "sharp";

import {
  ImageInvalidError,
  MAX_ENCODED_BYTES,
  MAX_LONGER_EDGE,
  MAX_UPLOAD_BYTES,
  THUMBNAIL_LONGER_EDGE,
  processImage,
} from "../src/index.js";
import type { ProcessedImage } from "../src/types.js";

/**
 * Unit tests for `processImage`. Each rejection branch is exercised with a
 * fixture generated programmatically by `sharp` (so the test suite carries no
 * binary fixtures), and the happy path verifies the four post-conditions
 * required by Requirement 2.7: EXIF stripped, longest edge ≤ 1600 px, encoded
 * size ≤ 300 KB, and a 480 px long-edge WebP thumbnail.
 */
describe("processImage", () => {
  describe("rejection branches", () => {
    it("throws ImageInvalidError(reason='size') when bytes exceed the 8 MB cap", async () => {
      // The size guard runs before any libvips decode, so its only contract
      // is `bytes.length > MAX_UPLOAD_BYTES → throw`. A `Buffer.alloc` of the
      // exact size+1 exercises that comparison without paying the seconds-long
      // cost of an 8000×8000 sharp encode just to land back at the same
      // length check. We still set a JPEG SOI prefix so a future re-ordering
      // of `sniff → size` would surface as a different reason rather than
      // silently keep this test green.
      const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
      oversized[0] = 0xff;
      oversized[1] = 0xd8;
      oversized[2] = 0xff;
      oversized[3] = 0xe0;

      const err = await processImage({
        bytes: oversized,
        declaredMime: "image/jpeg",
      }).then(
        () => null,
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(ImageInvalidError);
      expect((err as ImageInvalidError).reason).toBe("size");
    });

    it("throws ImageInvalidError(reason='format') for unsupported formats (GIF)", async () => {
      // GIF89a magic does not match any of the four sniffed formats (JPEG,
      // PNG, WebP, HEIC) so `sniffFormat` returns null and `processImage`
      // rejects with reason 'format' before reaching MIME or decode steps.
      // A short hand-rolled buffer is sufficient: `sniffFormat` only
      // inspects the first 12 bytes.
      const gif = Buffer.concat([
        Buffer.from("GIF89a", "ascii"),
        Buffer.alloc(20),
      ]);

      const err = await processImage({
        bytes: gif,
        declaredMime: "image/gif",
      }).then(
        () => null,
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(ImageInvalidError);
      expect((err as ImageInvalidError).reason).toBe("format");
    });

    it("throws ImageInvalidError(reason='dimensions') when the shorter edge < 256 px", async () => {
      // 200×200 is a square below the 256 px MIN_SHORTER_EDGE floor. The
      // buffer is a perfectly valid JPEG so format/MIME pass and the failure
      // is exclusively the dimension guard.
      const tiny = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 80, g: 120, b: 160 },
        },
      })
        .jpeg({ quality: 90 })
        .toBuffer();

      const err = await processImage({
        bytes: tiny,
        declaredMime: "image/jpeg",
      }).then(
        () => null,
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(ImageInvalidError);
      expect((err as ImageInvalidError).reason).toBe("dimensions");
    });

    it("throws ImageInvalidError(reason='mime_mismatch') when the declared MIME disagrees with the decoded format", async () => {
      // Encode a real PNG (so `sniffFormat` returns 'png' and the decode
      // succeeds) but lie about it being a JPEG. The mismatch branch is the
      // last gate before sharp metadata reads, so this isolates the MIME
      // guard.
      const png = await sharp({
        create: {
          width: 600,
          height: 400,
          channels: 3,
          background: { r: 200, g: 180, b: 60 },
        },
      })
        .png()
        .toBuffer();

      const err = await processImage({
        bytes: png,
        declaredMime: "image/jpeg",
      }).then(
        () => null,
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(ImageInvalidError);
      expect((err as ImageInvalidError).reason).toBe("mime_mismatch");
    });
  });

  describe("happy path (1800×1200 JPEG with EXIF)", () => {
    let original: Buffer;
    let result: ProcessedImage;

    beforeAll(async () => {
      // Build an 1800×1200 photographic-shaped JPEG and embed an EXIF block
      // so we can later assert the block is stripped from the persisted
      // output. `withMetadata` is the API the design doc calls out and it
      // still accepts an embedded EXIF object in sharp 0.34.
      original = await sharp({
        create: {
          width: 1800,
          height: 1200,
          channels: 3,
          background: { r: 90, g: 140, b: 210 },
        },
      })
        .withMetadata({
          exif: {
            IFD0: {
              Software: "powerlvl-test",
              ImageDescription: "fixture-with-exif",
            },
          },
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      // Sanity check: if the fixture itself never carried EXIF the
      // strip-on-process assertion below would be vacuous. This catches a
      // future sharp release silently changing the embed semantics.
      const sourceMeta = await sharp(original).metadata();
      expect(sourceMeta.exif).toBeDefined();
      expect(sourceMeta.width).toBe(1800);
      expect(sourceMeta.height).toBe(1200);

      result = await processImage({
        bytes: original,
        declaredMime: "image/jpeg",
      });
    });

    it("re-encodes the persisted image as AVIF or WebP under the 300 KB budget", () => {
      expect(result.format === "avif" || result.format === "webp").toBe(true);
      expect(result.processed.length).toBeLessThanOrEqual(MAX_ENCODED_BYTES);
    });

    it("downscales the longer edge to ≤ 1600 px while preserving aspect ratio", () => {
      const longer = Math.max(result.width, result.height);
      const shorter = Math.min(result.width, result.height);
      expect(longer).toBeLessThanOrEqual(MAX_LONGER_EDGE);
      // 1800:1200 = 3:2; sharp's `fit: 'inside'` resizer hits the long-edge
      // cap exactly and rounds the short edge to 1066 or 1067 depending on
      // libvips' integer rounding mode.
      expect(longer).toBe(MAX_LONGER_EDGE);
      expect(Math.abs(shorter - 1067)).toBeLessThanOrEqual(1);
    });

    it("strips EXIF from the persisted image", async () => {
      const meta = await sharp(result.processed).metadata();
      expect(meta.exif).toBeUndefined();
    });

    it("emits a 480 px long-edge WebP thumbnail with the correct aspect ratio", async () => {
      const thumbMeta = await sharp(result.thumbnail).metadata();
      expect(thumbMeta.format).toBe("webp");

      const thumbW = thumbMeta.width ?? 0;
      const thumbH = thumbMeta.height ?? 0;
      expect(Math.max(thumbW, thumbH)).toBe(THUMBNAIL_LONGER_EDGE);
      // 1800:1200 → 480:320 once the long edge is fixed at 480.
      expect(Math.min(thumbW, thumbH)).toBe(320);
    });

    it("returns a 16-character lowercase hex perceptual hash (64 bits)", () => {
      expect(result.perceptualHash).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});

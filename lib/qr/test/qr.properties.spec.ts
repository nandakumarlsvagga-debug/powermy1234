import { Resvg } from "@resvg/resvg-js";
import fc from "fast-check";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { renderQrSvg } from "../src/index.js";

/**
 * URL-shaped character set: ASCII letters, digits, and the punctuation that
 * actually appears in HTTP(S) permalinks ({@link https://www.rfc-editor.org/rfc/rfc3986 RFC 3986}
 * unreserved + reserved + percent-encoding marker). This is intentionally
 * narrower than full printable ASCII so the generator focuses on payloads
 * shaped like the permalinks `/scan/{id}` actually carries on the Share Card.
 */
const URL_CHARSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" +
  "-._~:/?#[]@!$&'()*+,;=%";

/**
 * Arbitrary producing URL-shaped strings of length 16..256. The lower bound
 * is dictated by the task; the upper bound is well below the QR-M byte-mode
 * capacity so the encoder never overflows even at extreme input lengths.
 */
const urlShapedString = fc.stringOf(
  fc.constantFrom(...URL_CHARSET.split("")),
  { minLength: 16, maxLength: 256 },
);

/**
 * Pinned fast-check seed and path so any future regression reproduces with
 * the exact same counterexample. The values are arbitrary but stable.
 */
const FC_SEED = 0x50574c56; // "PWLV"
const FC_PATH = "0";

/**
 * Render an SVG QR for `text` at 264 px (story Share Card size), rasterize it
 * to PNG via `@resvg/resvg-js`, then decode the PNG into ImageData and feed
 * it to `jsqr`. Returns the decoded text or `null` on a failed decode.
 */
function decodeRoundTrip(text: string): string | null {
  const svg = renderQrSvg(text, { size: 264 });

  const png = new Resvg(svg, {
    // The source SVG is already 264×264, but `fitTo` ensures the rasterized
    // PNG is exactly 264 px wide regardless of how the underlying viewBox is
    // laid out, which keeps the decoded ImageData at a single known size.
    fitTo: { mode: "width", value: 264 },
  })
    .render()
    .asPng();

  const decoded = PNG.sync.read(Buffer.from(png));
  // jsqr expects RGBA bytes wrapped in a Uint8ClampedArray; pngjs always
  // produces RGBA when the source has been rasterized through resvg.
  const data = new Uint8ClampedArray(
    decoded.data.buffer,
    decoded.data.byteOffset,
    decoded.data.byteLength,
  );
  const result = jsQR(data, decoded.width, decoded.height);
  return result === null ? null : result.data;
}

describe("QR decode round-trip", () => {
  /**
   * Smoke cases with the exact absolute-permalink shape that the Share Card
   * actually carries: `https://powerlvl.app/scan/<uuid>`. These anchor the
   * fast-check property below in concrete realistic inputs.
   */
  it.each([
    "https://powerlvl.app/scan/9f2b6c1a-0c4e-4e7c-8b2c-3f1a9d5e7c10",
    "https://powerlvl.app/scan/00000000-0000-4000-8000-000000000000",
    "https://powerlvl.app/scan/ffffffff-ffff-4fff-bfff-ffffffffffff",
  ])("round-trips the absolute permalink %s", (permalink) => {
    expect(decodeRoundTrip(permalink)).toBe(permalink);
  });

  /**
   * **Property 38: Card Carries QR Encoding Permalink (library-level precondition)**
   *
   * For arbitrary URL-shaped strings of length 16..256, rendering the QR via
   * {@link renderQrSvg}, rasterizing the SVG, and decoding the resulting PNG
   * with `jsqr` returns the original input text exactly.
   *
   * Validates: Requirements 8.3, 8.4
   */
  it("renderQrSvg + resvg + jsqr round-trips URL-shaped payloads", () => {
    fc.assert(
      fc.property(urlShapedString, (text) => {
        const decoded = decodeRoundTrip(text);
        expect(decoded).toBe(text);
      }),
      // Rasterizing through resvg + decoding through jsqr is heavier than a
      // typical property-based test; 32 runs is enough to exercise the
      // length range while keeping the suite under the vitest timeout. The
      // seed and path are pinned so any regression reproduces deterministically.
      { numRuns: 32, seed: FC_SEED, path: FC_PATH },
    );
  });
});

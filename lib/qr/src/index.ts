import qrcode from "qrcode-generator";

/**
 * Options for {@link renderQrSvg}.
 */
export interface RenderQrSvgOptions {
  /**
   * Total pixel size of the rendered SVG (width === height). The SVG is drawn
   * with a `viewBox` matching the module grid, so the QR scales perfectly to
   * this pixel size when rendered.
   *
   * Defaults to {@link DEFAULT_QR_SIZE_PX} (264 px), the size required by the
   * 1080×1920 story Share Card. The 1080×1080 square card should pass `220`
   * and the 1200×628 landscape card should pass `160` — see
   * `artifacts/share-card`.
   */
  size?: number;

  /**
   * Quiet-zone width in modules, applied symmetrically on all four sides.
   * The QR specification requires a minimum quiet zone of 4 modules for
   * reliable scanning, which is the default here.
   */
  quietZoneModules?: number;
}

/**
 * Default rendered pixel size for a Verification QR. Matches the story
 * Share Card requirement of 264 px.
 */
export const DEFAULT_QR_SIZE_PX = 264;

/**
 * Default quiet-zone width in modules. Four modules is the QR-spec minimum
 * for reliable optical decoding from a phone camera.
 */
export const DEFAULT_QUIET_ZONE_MODULES = 4;

/**
 * Error-correction level used for every Verification QR. Level M ("medium")
 * recovers from ~15% of the modules being damaged, which gives reliable
 * scanning from a phone held against a 9:16 share card displayed full-screen
 * without sacrificing module density.
 */
const ERROR_CORRECTION_LEVEL = "M" as const;

/**
 * Render a deterministic SVG QR code at error-correction level M.
 *
 * The output is a self-contained SVG string with:
 *   - a `viewBox` of `0 0 {totalModules} {totalModules}` (modules including
 *     the quiet zone) so the same QR can be rendered at any pixel size while
 *     remaining pixel-perfect,
 *   - an explicit `width` and `height` attribute equal to {@link RenderQrSvgOptions.size},
 *   - a single white background `<rect>` and a single black `<path>` whose
 *     segments are emitted in row-major order so the same input always
 *     produces a byte-identical SVG.
 *
 * @param text The string to encode. For POWERLVL this is always the absolute
 *   permalink URL `${baseUrl}/scan/{id}`.
 * @param opts Optional rendering overrides.
 * @returns A complete SVG document as a string.
 */
export function renderQrSvg(
  text: string,
  opts: RenderQrSvgOptions = {},
): string {
  const size = opts.size ?? DEFAULT_QR_SIZE_PX;
  const quietZoneModules =
    opts.quietZoneModules ?? DEFAULT_QUIET_ZONE_MODULES;

  if (typeof text !== "string") {
    throw new TypeError("renderQrSvg: text must be a string");
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new TypeError(
      `renderQrSvg: size must be a positive finite number, got ${String(size)}`,
    );
  }
  if (!Number.isInteger(quietZoneModules) || quietZoneModules < 0) {
    throw new TypeError(
      `renderQrSvg: quietZoneModules must be a non-negative integer, got ${String(
        quietZoneModules,
      )}`,
    );
  }

  // typeNumber=0 means: auto-pick the smallest QR version that fits the data
  // at the requested error-correction level. Same input always yields the
  // same matrix, which keeps the rendered SVG deterministic.
  const qr = qrcode(0, ERROR_CORRECTION_LEVEL);
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const totalModules = moduleCount + quietZoneModules * 2;

  // Walk the module grid in row-major order and emit a 1×1 path segment per
  // dark module, offset by the quiet zone. Using a single concatenated path
  // keeps the SVG small and deterministic.
  let path = "";
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        const x = col + quietZoneModules;
        const y = row + quietZoneModules;
        path += `M${x} ${y}h1v1h-1z`;
      }
    }
  }

  // Note: viewBox uses module units; width/height are pixels. The
  // `shape-rendering="crispEdges"` hint keeps modules pixel-aligned when the
  // SVG is rasterized through resvg.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}"` +
    ` width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${totalModules}" height="${totalModules}" fill="#ffffff"/>` +
    (path === "" ? "" : `<path d="${path}" fill="#000000"/>`) +
    `</svg>`
  );
}

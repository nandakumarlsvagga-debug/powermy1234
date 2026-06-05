import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `satori`'s font config shape, redeclared locally so this module does not
 * depend on `satori`'s type surface (which would force a value-time import in
 * environments that only need the descriptors, e.g. tests).
 */
export interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight?: 400 | 500 | 600 | 700;
  style?: "normal" | "italic";
}

const FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fonts",
);

interface FontDescriptor {
  /** Font-family name as referenced from layouts. Mirrors `FONTS` in `@workspace/design-tokens`. */
  name: "Geist" | "Geist Mono";
  /** Filename inside `src/fonts/`. Must be a Latin/digit subset to keep cold starts under budget. */
  file: string;
  weight: 400 | 500 | 600 | 700;
  style: "normal" | "italic";
}

/**
 * Bundled font subsets used by the share-card renderer.
 *
 * Subsets are limited to Latin + digits because the card never renders user
 * descriptions in non-Latin scripts (descriptions go through `@workspace/description-sanitizer`
 * which already strips non-Latin code points) and the Score is digits-only.
 *
 * To regenerate the subsets:
 *   1. Download Geist and Geist Mono from `https://vercel.com/font` (OFL).
 *   2. Subset to U+0020-U+007E using `glyphhanger` or `pyftsubset`.
 *   3. Drop the resulting `.ttf` files into `src/fonts/` with the names below.
 *
 * Font files are intentionally excluded from version control until subsets are
 * generated; see `src/fonts/README.md`.
 */
const FONT_DESCRIPTORS: readonly FontDescriptor[] = [
  { name: "Geist", file: "Geist-Regular.subset.ttf", weight: 400, style: "normal" },
  { name: "Geist", file: "Geist-Medium.subset.ttf", weight: 500, style: "normal" },
  { name: "Geist", file: "Geist-SemiBold.subset.ttf", weight: 600, style: "normal" },
  { name: "Geist", file: "Geist-Bold.subset.ttf", weight: 700, style: "normal" },
  { name: "Geist Mono", file: "GeistMono-Regular.subset.ttf", weight: 400, style: "normal" },
  { name: "Geist Mono", file: "GeistMono-Medium.subset.ttf", weight: 500, style: "normal" },
];

let cachedFonts: SatoriFont[] | null = null;

/**
 * Loads the bundled Geist + Geist Mono font subsets from disk and returns them
 * in a shape compatible with `satori`'s `fonts` option. The result is cached
 * for the lifetime of the process so repeated renders within a warm function
 * instance do not re-read the files.
 */
export async function loadFonts(): Promise<SatoriFont[]> {
  if (cachedFonts) {
    return cachedFonts;
  }

  const loaded = await Promise.all(
    FONT_DESCRIPTORS.map(async (descriptor): Promise<SatoriFont> => {
      const fullPath = path.join(FONTS_DIR, descriptor.file);
      const buf = await readFile(fullPath);
      // `satori` accepts `Buffer | ArrayBuffer`; copy into a plain ArrayBuffer
      // so the type does not depend on Node's `Buffer` type.
      const ab = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
      return {
        name: descriptor.name,
        data: ab,
        weight: descriptor.weight,
        style: descriptor.style,
      };
    }),
  );

  cachedFonts = loaded;
  return loaded;
}

/**
 * Test-only hook to clear the in-memory cache. Not exported from the package
 * entry point; consumed by future snapshot/property tests in 12.5 and 12.6.
 */
export function __resetFontCacheForTests(): void {
  cachedFonts = null;
}

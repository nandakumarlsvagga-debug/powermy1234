/**
 * POWERLVL wordmark assets (Req 12.17).
 *
 * Exports:
 *   - `Wordmark`        — inline-SVG React component (preferred for the
 *                         landing LCP element and any in-app surface)
 *   - `WORDMARK_ASSETS` — typed catalog of asset URLs for use sites where
 *                         a raster file is required (e.g. share-card PNG
 *                         renderer, Open Graph fallbacks, native share
 *                         sheet thumbnails)
 */

import wordmarkSvgUrl from './wordmark.svg'
import wordmark1xUrl from './wordmark@1x.png'
import wordmark2xUrl from './wordmark@2x.png'
import wordmark3xUrl from './wordmark@3x.png'

export { Wordmark, type WordmarkProps } from './Wordmark'

/**
 * Catalog of wordmark asset URLs resolved by the consuming bundler.
 *
 * The `svg` entry is preferred for any surface that can render SVG; the
 * PNG variants exist for raster pipelines (Share Card composition via
 * satori, native share sheet thumbnails, OG image fallbacks).
 */
export const WORDMARK_ASSETS = {
  svg: wordmarkSvgUrl,
  png1x: wordmark1xUrl,
  png2x: wordmark2xUrl,
  png3x: wordmark3xUrl,
} as const

export type WordmarkAssetKey = keyof typeof WORDMARK_ASSETS

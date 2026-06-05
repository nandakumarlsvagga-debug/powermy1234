import { type FC, type SVGProps } from 'react'

/**
 * POWERLVL wordmark React component (Req 12.17).
 *
 * Typography-first; no mascot, no pictorial mark. Inlines the SVG so the
 * landing surface's LCP element lands without a network request (Req 13.3
 * also drives the preload story).
 *
 * The fill resolves to `currentColor`, so the wordmark recolors to the
 * surrounding text color. On production matte-black surfaces the consumer
 * wraps it in `text-white` (mapped to COLORS.white).
 */
export interface WordmarkProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /**
   * Shorthand for `width`; height scales proportionally from the SVG's
   * 720×120 viewBox (aspect ratio 6:1). Defaults to 240 px for the nav
   * rail; consumers should pass a larger value for the reveal hero and
   * Share Card layouts.
   */
  width?: number | string
  /**
   * Optional explicit height. Provided only when the consumer needs to
   * lock the wordmark against a fixed grid row; otherwise let the
   * intrinsic aspect ratio handle it.
   */
  height?: number | string
}

export const Wordmark: FC<WordmarkProps> = ({ width = 240, height, ...rest }) => (
  <svg
    role="img"
    aria-label="POWERLVL"
    viewBox="0 0 720 120"
    width={width}
    height={height}
    fill="currentColor"
    {...rest}
  >
    <title>POWERLVL</title>
    {/* P */}
    <path d="M30 18 H78 a30 30 0 0 1 0 60 H50 V102 H30 Z M50 36 V60 H78 a12 12 0 0 0 0 -24 Z" />
    {/* O */}
    <path d="M132 16 a44 44 0 0 1 44 44 v0 a44 44 0 0 1 -88 0 v0 a44 44 0 0 1 44 -44 Z M132 36 a24 24 0 0 0 -24 24 v0 a24 24 0 0 0 48 0 v0 a24 24 0 0 0 -24 -24 Z" />
    {/* W */}
    <path d="M196 18 H216 L228 78 L240 18 H260 L272 78 L284 18 H304 L284 102 H264 L250 42 L236 102 H216 Z" />
    {/* E */}
    <path d="M318 18 H378 V36 H338 V52 H372 V70 H338 V84 H378 V102 H318 Z" />
    {/* R */}
    <path d="M392 18 H440 a28 28 0 0 1 14 52 L470 102 H448 L434 72 H412 V102 H392 Z M412 36 V54 H440 a9 9 0 0 0 0 -18 Z" />
    {/* L */}
    <path d="M488 18 H508 V84 H548 V102 H488 Z" />
    {/* V */}
    <path d="M558 18 H578 L598 76 L618 18 H638 L608 102 H588 Z" />
    {/* L */}
    <path d="M650 18 H670 V84 H710 V102 H650 Z" />
  </svg>
)

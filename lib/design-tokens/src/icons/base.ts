import type { SVGProps } from 'react'

/**
 * Shared props contract for every monoline icon in the design system.
 *
 * Icons accept all native `<svg>` props plus an optional `size` shorthand
 * that sets both `width` and `height`. Stroke-based monoline icons inherit
 * `stroke` from `currentColor` so they recolor to the surrounding text
 * color by default — this lets the Amber and HUD-cyan lockdowns stay
 * enforced at the parent layer.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /**
   * Shorthand for `width` and `height` in pixels. Defaults to 24 so every
   * icon renders consistently on the 8-pt grid (3 × SPACING_BASE).
   */
  size?: number | string
}

/**
 * Default props applied to every monoline icon. `viewBox` is fixed at
 * 24×24 so consumers can safely override only `size` without breaking
 * stroke widths.
 */
export const ICON_DEFAULTS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/**
 * @workspace/design-tokens
 *
 * Single source of truth for POWERLVL's visual identity. Consumed by the
 * web client and the share-card renderer so colors, fonts, spacing, motion
 * presets, and per-tier accents stay in sync across surfaces.
 *
 * Scope of this barrel:
 *   - COLORS              (Req 12.1) the five-color production palette
 *   - TIER_ACCENTS        (Req 12.4) per-tier accent colors D..LIMITLESS
 *   - FONTS               (Req 12.5) the two permitted type families
 *   - SPACING_BASE        (Req 12.7) the 8-pt grid base
 *   - HERO_CLEARANCE_PX   (Req 12.7) minimum clearance around hero elements
 *
 * Motion presets and helpers are exported from `./motion`.
 * Monoline icon SVG components are exported from `./icons`.
 * Wordmark SVG/PNG asset URLs are exported from `./wordmark`.
 */

/**
 * The eight-tier hierarchy used throughout POWERLVL. This mirrors the
 * `Tier` enum in `@workspace/api-zod` but is kept locally so design-tokens
 * has zero runtime dependencies on the API layer.
 */
export type Tier = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS' | 'LIMITLESS'

/**
 * Production palette — exactly five color tokens (Req 12.1).
 *
 * - `matteBlack` — global background canvas
 * - `graphite`   — surface / card fill
 * - `white`      — primary typography
 * - `amber`      — restrained accent (Score, primary CTA, amber-tier badges)
 *                  (Req 12.2: at most one amber-toned element per viewport,
 *                  with the slam phase as the single exception)
 * - `hudCyan`    — scanner HUD only, never used outside `<HudOverlay>`
 *                  (Req 12.3)
 */
export const COLORS = {
  matteBlack: '#0A0A0B',
  graphite: '#1A1A1D',
  white: '#FAFAFA',
  amber: '#F5A623',
  hudCyan: '#5EEAD4',
} as const

export type ColorToken = keyof typeof COLORS

/**
 * Per-tier accent color (Req 12.4).
 *
 * `LIMITLESS` is rendered as an animated white-gold gradient by the
 * consuming `<TierBadge>` component, so the literal here is a sentinel
 * resolved at the component layer rather than a static hex.
 */
export const TIER_ACCENTS: Record<Tier, string> = {
  D: '#71717A', // zinc-500
  C: '#0EA5E9', // sky-500
  B: '#10B981', // emerald-500
  A: '#F5A623', // amber (shared brand token)
  S: '#F97316', // orange-500
  SS: '#F43F5E', // rose-500
  SSS: '#8B5CF6', // violet-500
  LIMITLESS: 'animated-white-gold',
} as const

/**
 * Sentinel value emitted by `TIER_ACCENTS.LIMITLESS`. Components must
 * compare strictly against this constant before rendering the animated
 * white-gold gradient treatment instead of a flat fill.
 */
export const LIMITLESS_ACCENT_SENTINEL = 'animated-white-gold' as const

/**
 * Type families (Req 12.5).
 *
 * - `display` — precision geometric sans for editorial copy and headings
 * - `mono`    — tabular monospaced face for numerics, HUD labels, system text
 *
 * `mono` is required for every numeric value rendered by the product so
 * digits stay horizontally aligned during animation and on the Share Card
 * (Req 12.6).
 */
export const FONTS = {
  display: '"Geist", "Inter Tight", system-ui, sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
} as const

export type FontToken = keyof typeof FONTS

/**
 * Base unit for the 8-point spacing grid (Req 12.7). Every margin, padding,
 * gap, and grid column step in the product is a positive integer multiple
 * of this constant.
 */
export const SPACING_BASE = 8 as const

/**
 * Minimum clearance in pixels between any Hero Element and an adjacent UI
 * element on the same surface (Req 12.7). Hero Elements are the revealed
 * Score on the Result Screen, the Share Card preview on the Result Screen,
 * the wordmark on the Landing surface, and the Score text on the Share
 * Card image.
 */
export const HERO_CLEARANCE_PX = 32 as const

/**
 * Re-exports of motion presets so consumers can pull either the whole
 * design system from the package root or the focused `./motion` subpath.
 */
export {
  SPRINGS,
  EASINGS,
  DURATIONS,
  withReducedMotion,
  type MotionPreset,
  type SpringPreset,
  type EasingPreset,
} from './motion'

import { type FC } from 'react'
import { ICON_DEFAULTS, type IconProps } from './base'

/**
 * Monoline HUD glyphs (Req 12.16).
 *
 * These icons live inside the scanner HUD overlay during the reveal
 * sequence and on Share Cards. They MUST recolor to HUD cyan only when
 * mounted inside `<HudOverlay>` so Req 12.3's lockdown holds.
 */

/** CORNER BRACKET — top-left framing mark. Use with rotate transforms for the other three. */
export const CornerBracketIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M4 10V5a1 1 0 0 1 1-1h5" />
  </svg>
)

/** RETICLE — circular target with crosshairs. */
export const ReticleIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 3v3" />
    <path d="M12 18v3" />
    <path d="M3 12h3" />
    <path d="M18 12h3" />
  </svg>
)

/** SCAN LINE — single horizontal sweep rule with anchor points. */
export const ScanLineIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M3 12h18" />
    <circle cx="3" cy="12" r="1" />
    <circle cx="21" cy="12" r="1" />
  </svg>
)

/** SIGNAL — ascending bars (telemetry strength). */
export const SignalIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M5 18v-3" />
    <path d="M10 18v-7" />
    <path d="M15 18v-11" />
    <path d="M20 18V4" />
  </svg>
)

/** SCOUTER — eye + bracket motif used on the Result Screen header. */
export const ScouterIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
)

/** WAVEFORM — analysis-phase activity readout. */
export const WaveformIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M3 12h2l2-5 3 10 3-13 3 8 3-3h2" />
  </svg>
)

/** ANOMALY — exclamation triangle for anomaly badges. */
export const AnomalyIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M12 4l9 16H3L12 4Z" />
    <path d="M12 10v5" />
    <circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
  </svg>
)

/** VERIFIED — shield with check (the "VERIFIED SCAN" badge on permalinks). */
export const VerifiedIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

/** LOCK-ON — concentric squares for the lock-on phase reveal. */
export const LockOnIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <rect x="4" y="4" width="16" height="16" rx="0.5" />
    <rect x="9" y="9" width="6" height="6" rx="0.5" />
  </svg>
)

/**
 * Aggregated lookup map for HUD icons. Keep in sync with the exported
 * components above so reveal-controller and share-card consumers can
 * dispatch by name.
 */
export const HUD_ICONS = {
  cornerBracket: CornerBracketIcon,
  reticle: ReticleIcon,
  scanLine: ScanLineIcon,
  signal: SignalIcon,
  scouter: ScouterIcon,
  waveform: WaveformIcon,
  anomaly: AnomalyIcon,
  verified: VerifiedIcon,
  lockOn: LockOnIcon,
} as const

export type HudIconName = keyof typeof HUD_ICONS

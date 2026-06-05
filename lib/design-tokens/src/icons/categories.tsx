import { type FC } from 'react'
import { ICON_DEFAULTS, type IconProps } from './base'

/**
 * Monoline Category icons (Req 3.2 / Req 12.16).
 *
 * Each of the six selectable Categories — SETUPS, FITNESS, DRIP, PETS,
 * RIDES, WILDCARD — has a custom monoline SVG. Production interfaces
 * MUST NOT render emoji glyphs as Category icons; these components are
 * the only sanctioned visual representation.
 */

/** SETUPS — monitor + standing desk silhouette. */
export const SetupsIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M9 20h6" />
    <path d="M12 16v4" />
    <path d="M7 8h10" />
    <path d="M7 11h6" />
  </svg>
)

/** FITNESS — barbell with end weights. */
export const FitnessIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M3 9v6" />
    <path d="M6 7v10" />
    <path d="M18 7v10" />
    <path d="M21 9v6" />
    <path d="M6 12h12" />
  </svg>
)

/** DRIP — droplet outline. */
export const DripIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M12 3.5c2.8 3.4 6 7.2 6 11a6 6 0 0 1-12 0c0-3.8 3.2-7.6 6-11Z" />
    <path d="M9 14.5a3 3 0 0 0 3 3" />
  </svg>
)

/** PETS — paw print. */
export const PetsIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <ellipse cx="6" cy="9" rx="1.6" ry="2.2" />
    <ellipse cx="10" cy="6" rx="1.6" ry="2.2" />
    <ellipse cx="14" cy="6" rx="1.6" ry="2.2" />
    <ellipse cx="18" cy="9" rx="1.6" ry="2.2" />
    <path d="M12 12c-3.6 0-6 2.5-6 5a3 3 0 0 0 4.5 2.6 3 3 0 0 1 3 0A3 3 0 0 0 18 17c0-2.5-2.4-5-6-5Z" />
  </svg>
)

/** RIDES — side-profile car silhouette. */
export const RidesIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M3 14h18" />
    <path d="M5 14l1.6-4.4A2 2 0 0 1 8.5 8h7a2 2 0 0 1 1.9 1.6L19 14" />
    <path d="M3 14v3h2" />
    <path d="M21 14v3h-2" />
    <circle cx="7.5" cy="17" r="1.6" />
    <circle cx="16.5" cy="17" r="1.6" />
  </svg>
)

/** WILDCARD — four-pointed sparkle / asterisk. */
export const WildcardIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M12 3v18" />
    <path d="M3 12h18" />
    <path d="M5.5 5.5l13 13" />
    <path d="M18.5 5.5l-13 13" />
  </svg>
)

/**
 * Lookup map keyed by `Category` (matches `@workspace/api-zod`'s `Category`
 * enum). Consumers like the Scan setup screen and the Share Card layout
 * pull the icon for the active Category through this map.
 */
export const CATEGORY_ICONS = {
  SETUPS: SetupsIcon,
  FITNESS: FitnessIcon,
  DRIP: DripIcon,
  PETS: PetsIcon,
  RIDES: RidesIcon,
  WILDCARD: WildcardIcon,
} as const

export type CategoryIconName = keyof typeof CATEGORY_ICONS

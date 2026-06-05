import { type FC } from 'react'
import { ICON_DEFAULTS, type IconProps } from './base'

/**
 * Monoline navigation icons (Req 12.16).
 *
 * Custom SVGs for the nav rail and global chrome. These are the
 * authorized navigation glyphs in the production interface; emoji and
 * raster mark renderings are not permitted.
 */

/** CLOSE — diagonal cross. */
export const CloseIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
)

/** BACK — chevron pointing left. */
export const BackIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M14 6l-6 6 6 6" />
  </svg>
)

/** MENU — three horizontal rules. */
export const MenuIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </svg>
)

/** SHARE — node + two outbound branches. */
export const ShareIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <circle cx="6" cy="12" r="2.4" />
    <circle cx="18" cy="6" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
    <path d="M8.1 11l7.8-3.9" />
    <path d="M8.1 13l7.8 3.9" />
  </svg>
)

/** LIKE — outline heart (Feed like control). */
export const LikeIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M12 19s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 9c0 5.7-7 10-7 10Z" />
  </svg>
)

/** LEADERBOARD — three rising bars. */
export const LeaderboardIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <rect x="4" y="13" width="4" height="7" rx="0.5" />
    <rect x="10" y="9" width="4" height="11" rx="0.5" />
    <rect x="16" y="5" width="4" height="15" rx="0.5" />
  </svg>
)

/** FEED — stacked horizontal panels. */
export const FeedIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <rect x="4" y="5" width="16" height="4" rx="0.5" />
    <rect x="4" y="11" width="16" height="4" rx="0.5" />
    <rect x="4" y="17" width="16" height="2.5" rx="0.5" />
  </svg>
)

/** PROFILE — head + shoulders silhouette. */
export const ProfileIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
)

/** COPY — two stacked rounded rectangles. */
export const CopyIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
  </svg>
)

/** UPLOAD — tray with up arrow (Scan setup). */
export const UploadIcon: FC<IconProps> = ({ size = 24, ...rest }) => (
  <svg {...ICON_DEFAULTS} width={size} height={size} {...rest}>
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
)

/**
 * Aggregated lookup map for navigation icons. Keep in sync with the
 * exported components above so consumers can dynamically dispatch by name.
 */
export const NAVIGATION_ICONS = {
  close: CloseIcon,
  back: BackIcon,
  menu: MenuIcon,
  share: ShareIcon,
  like: LikeIcon,
  leaderboard: LeaderboardIcon,
  feed: FeedIcon,
  profile: ProfileIcon,
  copy: CopyIcon,
  upload: UploadIcon,
} as const

export type NavigationIconName = keyof typeof NAVIGATION_ICONS

/**
 * Monoline icon set for POWERLVL.
 *
 * Three families:
 *   - Categories (Req 3.2 / Req 12.16) — six selectable Categories
 *   - Navigation (Req 12.16)           — global nav and chrome glyphs
 *   - HUD       (Req 12.3 / Req 12.16) — scanner HUD glyphs (cyan-locked)
 *
 * Re-exporting individual components and the lookup maps so consumers can
 * either import a specific icon by name or dispatch through the map.
 */

export { type IconProps, ICON_DEFAULTS } from './base'

export {
  SetupsIcon,
  FitnessIcon,
  DripIcon,
  PetsIcon,
  RidesIcon,
  WildcardIcon,
  CATEGORY_ICONS,
  type CategoryIconName,
} from './categories'

export {
  CloseIcon,
  BackIcon,
  MenuIcon,
  ShareIcon,
  LikeIcon,
  LeaderboardIcon,
  FeedIcon,
  ProfileIcon,
  CopyIcon,
  UploadIcon,
  NAVIGATION_ICONS,
  type NavigationIconName,
} from './navigation'

export {
  CornerBracketIcon,
  ReticleIcon,
  ScanLineIcon,
  SignalIcon,
  ScouterIcon,
  WaveformIcon,
  AnomalyIcon,
  VerifiedIcon,
  LockOnIcon,
  HUD_ICONS,
  type HudIconName,
} from './hud'

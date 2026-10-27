/*
 * WHERE THE MENU GOES. The list in one place, so the menu, App and the audits'
 * navigation helper (scripts/preflight.mjs) name the same items the same way.
 *
 * NINE ITEMS, gold to night blue: Plan, Sky, Exposure, Kit, Saved spots,
 * Viewfinder, Call sheet, Settings, About. Exposure has its own item since
 * the field test of 27 Oct; it was a page of Sky nobody found. Field and the
 * Shoot setup / Field buttons under Plan are gone from the menu: Shoot setup
 * lives inside Plan. Their ids stay in MenuItem, and the old paths still land
 * on them (OLD_PATHS below): a place that moved is still a place.
 */
import type { GlyphId } from '../components/Icon.tsx'

export type MenuItem =
  | 'plan'
  | 'setup'
  | 'field'
  | 'sky'
  | 'exposure'
  | 'kit'
  | 'saved'
  | 'now'
  | 'viewfinder'
  | 'callsheet'
  | 'settings'
  | 'about'

export interface MenuEntry {
  id: MenuItem
  label: string
  note: string
  icon: GlyphId
  /** Doors folded into this item, shown under it. */
  subs?: readonly { id: MenuItem; label: string }[]
}

export const MENU_ITEMS: readonly MenuEntry[] = [
  {
    id: 'plan',
    label: 'Plan',
    note: 'Positions, light and conditions',
    icon: 'plan',
  },
  { id: 'sky', label: 'Sky', note: 'Tonight, now, the moon, the next 30 nights', icon: 'sky' },
  { id: 'exposure', label: 'Exposure', note: 'Shutter, aperture and ISO for the light', icon: 'exposure' },
  { id: 'kit', label: 'Kit', note: 'What is in the bag', icon: 'kit' },
  { id: 'saved', label: 'Saved spots', note: 'On this phone', icon: 'saved' },
  { id: 'viewfinder', label: 'Viewfinder', note: 'The camera with the sun and your frames on it', icon: 'viewfinder' },
  { id: 'callsheet', label: 'Call sheet', note: 'Run of show and shot list, on your own key', icon: 'callsheet' },
  { id: 'settings', label: 'Settings', note: 'Clock, wind and distance', icon: 'settings' },
  { id: 'about', label: 'About', note: 'Backup, your key, what leaves your phone', icon: 'about' },
]

/** The top-level item a place lives under, for marking where you are. */
export function menuHome(item: MenuItem): MenuItem {
  if (item === 'setup' || item === 'field') return 'plan'
  if (item === 'now') return 'sky'
  return item
}

/**
 * PATHS THAT STILL LAND. The app has one real page path, /how; these are the
 * names of the places, so a typed or remembered /field opens Field rather than
 * a 404. vercel.json rewrites each to the app; App reads it once and puts the
 * address back to /.
 */
export const OLD_PATHS: Readonly<Record<string, MenuItem>> = {
  '/plan': 'plan',
  '/setup': 'setup',
  '/field': 'field',
  '/now': 'now',
  '/sky': 'sky',
  '/kit': 'kit',
  '/saved': 'saved',
  '/settings': 'settings',
  '/about': 'about',
}

export function pathToMenuItem(pathname: string): MenuItem | null {
  const key = pathname.replace(/\/+$/, '').toLowerCase()
  return OLD_PATHS[key] ?? null
}

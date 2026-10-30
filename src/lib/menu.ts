/*
 * WHERE THE MENU GOES. The list in one place, so the menu, App and the audits'
 * navigation helper (scripts/preflight.mjs) name the same items the same way.
 *
 * SEVEN ITEMS, GROUPED BY JOB (field test, 30 Oct; docs/ux-rules.md rule 24;
 * docs/navigation.md has the tree and the taps to each place). It was twelve
 * flat items. Now: Plan · Sky · Water · Fly · Kit · Saved · Settings, with
 * the places that belong to a job under it, each one tap from the menu.
 * Field is still reached by its address, /field (OLD_PATHS below): a place
 * that moved is still a place.
 */
import type { GlyphId } from '../components/Icon.tsx'

export type MenuItem =
  | 'plan'
  | 'setup'
  | 'field'
  | 'sky'
  | 'water'
  | 'tides'
  | 'surf'
  | 'wind'
  | 'exposure'
  | 'kit'
  | 'saved'
  | 'now'
  | 'viewfinder'
  | 'preflight'
  | 'callsheet'
  | 'settings'
  | 'about'

export interface MenuEntry {
  id: MenuItem
  label: string
  note: string
  icon: GlyphId
  /** Places that belong to this job, shown under it. */
  subs?: readonly { id: MenuItem; label: string }[]
}

export const MENU_ITEMS: readonly MenuEntry[] = [
  {
    id: 'plan',
    label: 'Plan',
    note: 'Positions, light and conditions',
    icon: 'plan',
    subs: [
      { id: 'now', label: 'Shoot now' },
      { id: 'setup', label: 'Setup' },
      { id: 'callsheet', label: 'Call sheet' },
    ],
  },
  { id: 'sky', label: 'Sky', note: 'Now, sky fire, special light, the calendar', icon: 'sky' },
  /* Water at the coast; Section 5 of 30 Oct makes it Land inland. Surf only where there is surf (SideMenu's hidden). */
  {
    id: 'water',
    label: 'Water',
    note: 'Tides, surf and wind',
    icon: 'tides',
    subs: [
      { id: 'tides', label: 'Tides' },
      { id: 'surf', label: 'Surf' },
      { id: 'wind', label: 'Wind' },
    ],
  },
  { id: 'preflight', label: 'Fly', note: 'Draw or fly a drone move', icon: 'preflight', subs: [{ id: 'viewfinder', label: 'Viewfinder' }] },
  { id: 'kit', label: 'Kit', note: 'What is in the bag', icon: 'kit', subs: [{ id: 'exposure', label: 'Exposure' }] },
  { id: 'saved', label: 'Saved', note: 'Spots, offline packs, past shoots', icon: 'saved' },
  { id: 'settings', label: 'Settings', note: 'Units, offline, privacy, about', icon: 'settings', subs: [{ id: 'about', label: 'About' }] },
]

/** The top-level item a place lives under, for marking where you are. */
export function menuHome(item: MenuItem): MenuItem {
  if (item === 'setup' || item === 'field' || item === 'now' || item === 'callsheet') return 'plan'
  if (item === 'tides' || item === 'surf' || item === 'wind') return 'water'
  if (item === 'viewfinder') return 'preflight'
  if (item === 'exposure') return 'kit'
  if (item === 'about') return 'settings'
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

/*
 * THE NAMES OF THE PLACES, and the old paths that still land on them. The
 * menu itself is src/components/Menu.tsx; docs/navigation.md has the tree and
 * the taps to each place. Field is still reached by its address, /field
 * (OLD_PATHS below): a place that moved is still a place.
 */
export type MenuItem =
  | 'today'
  | 'plan'
  | 'setup'
  | 'field'
  | 'sky'
  | 'water'
  | 'land'
  | 'terrain'
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

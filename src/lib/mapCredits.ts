/* The map credits' lines (src/components/MapCredits.tsx). */

/** Credited whenever the map is up: drawn by the app, not through a map source. */
export const APP_CREDITS: readonly string[] = [
  'Buildings and the sea: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors',
  'Trees: OpenStreetMap contributors, through Overpass',
]

/** The credits to list: each source's own line, once, then the app's. */
export function creditLines(sourceCredits: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...sourceCredits, ...APP_CREDITS]) {
    /* Plain text: a credit carrying markup has its tags taken off. */
    const line = (raw ?? '').replace(/<[^>]*>/g, '').trim()
    if (line === '' || seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}


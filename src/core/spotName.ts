/*
 * THE NAME YOU GAVE A PLACE (Batch FIX, Section 6.1).
 *
 * The Drone page's header said "Virginia Beach" at a spot saved as "Chic's
 * Beach": the venue's name is the reverse lookup's (the city), the spot's
 * name is yours. When the point is one of your saved spots, the header says
 * the spot's name. A spot further than SPOT_NAME_METRES away is somewhere
 * else, and its name is not returned (failure mode A: a name for somewhere
 * else is simply not returned).
 */
import type { LatLon } from './geo.ts'

/** A saved spot's pin within this many metres of the point names it. */
export const SPOT_NAME_METRES = 150

export interface NamedPlace {
  name: string
  venue: { latitude: string; longitude: string }
}

const R = 6_371_000
const rad = (d: number) => (d * Math.PI) / 180
function metres(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The nearest saved spot's name within SPOT_NAME_METRES of `at`, or null. */
export function spotNameAt(spots: readonly NamedPlace[], at: LatLon | null): string | null {
  if (at === null) return null
  let best: { name: string; m: number } | null = null
  for (const s of spots) {
    const lat = Number(s.venue.latitude)
    const lon = Number(s.venue.longitude)
    if (s.venue.latitude.trim() === '' || s.venue.longitude.trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const name = s.name.trim()
    if (name === '') continue
    const m = metres(at, { lat, lon })
    if (m <= SPOT_NAME_METRES && (best === null || m < best.m)) best = { name, m }
  }
  return best?.name ?? null
}

/** A search hit's label, short: "Chic's Beach, Virginia Beach, VA" → "Chic's Beach". */
export const shortPlace = (label: string): string => label.split(',')[0]?.trim() || label.trim()

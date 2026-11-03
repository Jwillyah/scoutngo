/*
 * BEST FIRE NEAR ME, FETCHED (Batch J, Section 5). Arithmetic is
 * src/core/bestView.ts.
 *
 * WHAT LEAVES THE PHONE: OpenFreeMap's vector tiles round the venue (the sea
 * polygons, cached on the phone; src/lib/coast.ts), nothing else. Your saved
 * spots are read from this phone's own storage and never sent anywhere.
 */
import { getPosition } from 'suncalc'
import { bestView, SHORE_REACH_M, WATER_REACH_M, type BestView, type ViewSpot } from '../core/bestView.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { seaTestAround } from './coast.ts'
import { reviveSpots, SPOTS_STORAGE_KEY } from './spots.ts'
import { venueLatLon } from './venue.ts'

/** Spots within this of the venue are ranked. */
export const RANK_WITHIN_KM = 15

function savedSpots(): ViewSpot[] {
  try {
    const raw = localStorage.getItem(SPOTS_STORAGE_KEY)
    return raw === null ? [] : reviveSpots(JSON.parse(raw)).flatMap((s) => {
      const at = venueLatLon(s.venue)
      return at === null ? [] : [{ name: s.name, at, facing: null }]
    })
  } catch {
    return []
  }
}

const cache = new Map<string, Promise<BestView | null>>()

export function fetchBestView(venue: LatLon, event: Date): Promise<BestView | null> {
  const key = `${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}@${event.getTime()}`
  let p = cache.get(key)
  if (p === undefined) {
    p = (async () => {
      const sea = await seaTestAround(venue, SHORE_REACH_M + WATER_REACH_M + 1000).catch(() => null)
      if (sea === null) return null
      const near = (s: ViewSpot) => distanceMeters(venue, s.at) <= RANK_WITHIN_KM * 1000
      const known = COAST_CAMS.map((c) => ({ name: c.name, at: c.at, facing: c.facing }))
      const seen = new Set<string>()
      const spots = [...savedSpots(), ...known].filter(near).filter((s) => {
        const k = s.name.split(/[,(]/)[0].trim()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      return bestView(venue, getPosition(event, venue.lat, venue.lon).azimuth, spots, sea)
    })()
    if (cache.size > 10) cache.clear()
    cache.set(key, p)
  }
  return p
}

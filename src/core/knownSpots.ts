/*
 * KNOWN SPOTS NEAR A PLACE (Batch I, Section 1: first run, no setup).
 *
 * After "Where do you shoot?" finds a town, a beach or a zip, or the phone's
 * location once, the app offers the shooting spots it already knows near
 * there: the coast cams' beaches, piers and jetties (src/data/coastCams.ts),
 * each with the way its beach faces. One tap and Today is that spot's.
 */
import { compassWord } from './compassWords.ts'
import { distanceMeters, type LatLon } from './geo.ts'

export interface KnownSpot {
  id: string
  name: string
  at: LatLon
  facing: number | null
}

export type SpotKind = 'pier' | 'jetty' | 'inlet' | 'bay' | 'beach'

export function spotKind(name: string): SpotKind {
  if (/\bpier\b/i.test(name)) return 'pier'
  if (/\bjetty\b|\bgroin\b/i.test(name)) return 'jetty'
  if (/\binlet\b/i.test(name)) return 'inlet'
  if (/\bbay\b|\bsound\b|\bharbou?r\b/i.test(name)) return 'bay'
  return 'beach'
}

export const NEAR_SPOTS_KM = 40
export const NEAR_SPOTS_SHOWN = 5

export function nearSpots(at: LatLon, spots: readonly KnownSpot[], n = NEAR_SPOTS_SHOWN): { spot: KnownSpot; km: number; kind: SpotKind; facingWord: string | null }[] {
  return spots
    .map((spot) => ({ spot, km: distanceMeters(at, spot.at) / 1000 }))
    .filter((s) => s.km <= NEAR_SPOTS_KM)
    .sort((a, b) => a.km - b.km)
    /* Two cams at one pier are one spot: the nearest of a name stands. */
    .filter((s, i, all) => all.findIndex((o) => o.spot.name === s.spot.name) === i)
    .slice(0, n)
    .map((s) => ({ ...s, kind: spotKind(s.spot.name), facingWord: s.spot.facing === null ? null : `faces ${compassWord(s.spot.facing)}` }))
}

/** "Use my location once": rounded to 2 decimals, about a kilometre, before it is kept. */
export const roundToKm = (at: LatLon): LatLon => ({ lat: Math.round(at.lat * 100) / 100, lon: Math.round(at.lon * 100) / 100 })

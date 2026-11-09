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
  /** Two-letter state, so "Ocean City MD" finds the Maryland one. */
  state?: string
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
    /* Two cams at one pier are one spot: the nearest of a name stands, and "Sandbridge" and "Sandbridge Beach" on one beach are one row. */
    .filter((s, i, all) => all.findIndex((o) => o.spot.name === s.spot.name || sameSpot(o.spot, s.spot)) === i)
    .slice(0, n)
    .map((s) => ({ ...s, kind: spotKind(s.spot.name), facingWord: s.spot.facing === null ? null : `faces ${compassWord(s.spot.facing)}` }))
}

/** "Use my location once": rounded to 2 decimals, about a kilometre, before it is kept. */
export const roundToKm = (at: LatLon): LatLon => ({ lat: Math.round(at.lat * 100) / 100, lon: Math.round(at.lon * 100) / 100 })

/*
 * ONE PLACE, ONE ROW (E7, 8 Nov). Two cam operators name the beach at Sandbridge
 * "Sandbridge" and "Sandbridge Beach", at one coordinate, and the picker showed
 * both. The same place is the same base name (case, punctuation and a closing
 * "Beach" aside) within SAME_SPOT_KM. Different breaks on one beach keep their
 * own rows: "Wrightsville Beach, C Street" is not "Wrightsville Beach, Crystal Pier".
 */
export const SAME_SPOT_KM = 1.5

/** "Sandbridge Beach" and "sandbridge" are one base name; "Ocean City, Boardwalk" keeps its part after the comma. */
export function spotBaseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ beach$/, '')
}

export function sameSpot(a: { name: string; at: LatLon }, b: { name: string; at: LatLon }): boolean {
  return spotBaseName(a.name) === spotBaseName(b.name) && distanceMeters(a.at, b.at) / 1000 <= SAME_SPOT_KM
}

/** The first of each same place stands, in the order given. */
export function mergeSameSpots<T extends { name: string; at: LatLon }>(spots: readonly T[]): T[] {
  return spots.filter((s, i) => spots.findIndex((o) => sameSpot(o, s)) === i)
}

const STATES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', CA: 'california', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii',
  LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MS: 'mississippi', NH: 'new hampshire', NJ: 'new jersey',
  NY: 'new york', NC: 'north carolina', OR: 'oregon', RI: 'rhode island', SC: 'south carolina', TX: 'texas', VA: 'virginia', WA: 'washington',
}

const words = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w !== '')

/**
 * THE KNOWN SPOTS BY NAME, before anything goes to a geocoder (E7). Every
 * word typed must start a word of the spot's name or its state ("ocean city
 * md", "wrightsville", "cape hatteras"); the spots whose name starts with the
 * first word come first. On the phone, offline, instant; nothing is sent.
 */
export function searchKnownSpots<T extends KnownSpot>(query: string, spots: readonly T[], n = 6): T[] {
  const typed = words(query)
  if (typed.length === 0) return []
  const scored = spots
    .map((spot, index) => {
      const own = words(spot.name)
      const state = spot.state === undefined ? [] : [spot.state.toLowerCase(), ...words(STATES[spot.state.toUpperCase()] ?? '')]
      const all = [...own, ...state]
      const hit = typed.every((w) => all.some((x) => x.startsWith(w)))
      return { spot, index, hit, lead: own[0]?.startsWith(typed[0]) ? 0 : 1 }
    })
    .filter((s) => s.hit)
    .sort((a, b) => a.lead - b.lead || a.index - b.index)
    .map((s) => s.spot)
  return mergeSameSpots(scored).slice(0, n)
}

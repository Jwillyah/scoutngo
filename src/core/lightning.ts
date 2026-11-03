/*
 * LIGHTNING AS A FACT (Batch K, Section 2). Strikes come as 8 km cells of a
 * 15-minute frame (src/lib/stormData.ts): the line says the nearest one, its
 * direction and its frame. No 10-mile rule, no countdown, no advice (ux-rules
 * 28): where it was and when, nothing about what to do.
 */
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { compassPoint } from './field.ts'
import type { CellCall } from './stormCells.ts'
import { destinationPoint } from './geo.ts'

export interface Strike {
  at: LatLon
  /** The 15-minute frame it fell in, by the frame's time stamp. */
  frame: Date
}

/** Strikes within this are said. */
export const STRIKE_REACH_KM = 160.9 /* 100 mi */

export function nearestStrike(venue: LatLon, strikes: readonly Strike[]): { km: number; bearingDeg: number; frame: Date } | null {
  let best: { km: number; bearingDeg: number; frame: Date } | null = null
  for (const s of strikes) {
    const km = distanceMeters(venue, s.at) / 1000
    if (km > STRIKE_REACH_KM) continue
    /* Nearest first; of two as near, the newer frame. */
    if (best === null || km < best.km - 0.5 || (Math.abs(km - best.km) <= 0.5 && s.frame > best.frame)) best = { km, bearingDeg: bearingBetween(venue, s.at), frame: s.frame }
  }
  return best
}

/** "Lightning 8 mi WSW · 15-min map of 7:00 PM". Null when there is none in reach. */
export function lightningLine(venue: LatLon, strikes: readonly Strike[], dist: 'mi' | 'km', clock: (d: Date) => string): string | null {
  const n = nearestStrike(venue, strikes)
  if (n === null) return null
  const d = Math.max(1, Math.round(dist === 'mi' ? n.km / 1.609344 : n.km))
  return `Lightning ${n.km < 4 ? 'within 4 km' : `${d} ${dist} ${compassPoint(n.bearingDeg)}`} · 15-min map of ${clock(n.frame)}`
}

/** On the map: the cells in the order said, the first MAP_CELLS, and paths for the MAP_PATHS listed. */
export const MAP_CELLS = 8
export const MAP_PATHS = 3

/** For the map: each strike cell a dot, fading with age (1 newest, 0.25 an hour old); each cell a ring with its path for 90 min. */
export function stormOnMap(strikes: readonly Strike[], cells: readonly CellCall[], now: Date): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const s of strikes) {
    const ageMin = Math.max(0, (now.getTime() - s.frame.getTime()) / 60_000)
    features.push({ type: 'Feature', properties: { kind: 'strike', fade: Math.max(0.25, Math.min(1, 1 - (ageMin - 15) / 60)) }, geometry: { type: 'Point', coordinates: [s.at.lon, s.at.lat] } })
  }
  cells.slice(0, MAP_CELLS).forEach((c, i) => {
    features.push({ type: 'Feature', properties: { kind: 'cell' }, geometry: { type: 'Point', coordinates: [c.at.lon, c.at.lat] } })
    if (c.towardDeg !== null && i < MAP_PATHS) {
      /* Its path for MAX_LEAD_MIN: 90 minutes at its speed. */
      const end = destinationPoint(c.at, c.towardDeg, c.kmh * 1.5 * 1000)
      features.push({ type: 'Feature', properties: { kind: 'track' }, geometry: { type: 'LineString', coordinates: [[c.at.lon, c.at.lat], [end.lon, end.lat]] } })
    }
  })
  return { type: 'FeatureCollection', features }
}

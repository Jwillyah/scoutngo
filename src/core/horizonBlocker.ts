/*
 * WHAT THE SUN GOES BEHIND, NAMED FROM WHAT IS THERE (Batch E, 1 Nov).
 *
 * The Day sheet said "Light gone 4:58 PM behind the ridge" at the Virginia
 * Beach pier, where there is no ridge: the skyline to the WSW is hotels. The
 * elevation horizon gives the angle; it cannot say what made it. So the
 * mapped buildings and trees along the sun's bearing are asked first:
 *
 *   buildings  a mapped building within BLOCK_DEG of the bearing and REACH_M
 *              of the venue that stands at least as high in the sky as the
 *              horizon there (a building of unknown height counts within
 *              NEAR_M: it is there, and nothing says it is low);
 *   trees      the same for mapped trees, at their nominal height;
 *   ridge      neither, and the ground round the venue has real relief;
 *   ground     neither, on low ground: "higher ground", never "a ridge".
 */
import { distanceMeters, type LatLon } from './geo.ts'
import { compassPoint } from './field.ts'

export const BLOCK_DEG = 8
export const REACH_M = 3000
export const NEAR_M = 1000
/** Under this much relief round the venue, a horizon bump is not a ridge (src/core/contours.ts FLAT_M). */
export const RIDGE_RELIEF_M = 15
const EYE_M = 1.6

export interface Footprint {
  ring: readonly (readonly [number, number])[]
  /** Metres, or null when the map does not say. */
  heightM: number | null
}

export interface TreePoint {
  at: LatLon
  heightM: number
}

export type Blocker = 'buildings' | 'trees' | 'ridge' | 'ground'

const bearingTo = (a: LatLon, b: LatLon): number => {
  const r = Math.PI / 180
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r)
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r)
  return ((Math.atan2(y, x) / r) + 360) % 360
}
const off = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

function stands(venue: LatLon, at: LatLon, heightM: number | null, azimuth: number, horizonDeg: number): boolean {
  if (off(bearingTo(venue, at), azimuth) > BLOCK_DEG) return false
  const d = distanceMeters(venue, at)
  if (d < 5 || d > REACH_M) return false
  if (heightM === null) return d <= NEAR_M
  return (Math.atan2(heightM - EYE_M, d) * 180) / Math.PI >= horizonDeg - 0.25
}

/** What the sun goes behind at `azimuth`, where the horizon stands `horizonDeg` up. */
export function nameBlocker(
  venue: LatLon,
  azimuth: number,
  horizonDeg: number,
  buildings: readonly Footprint[],
  trees: readonly TreePoint[],
  reliefM: number | null,
): Blocker {
  for (const b of buildings) {
    if (b.ring.some(([lon, lat]) => stands(venue, { lat, lon }, b.heightM, azimuth, horizonDeg))) return 'buildings'
  }
  if (trees.some((t) => stands(venue, t.at, t.heightM, azimuth, horizonDeg))) return 'trees'
  return reliefM !== null && reliefM < RIDGE_RELIEF_M ? 'ground' : 'ridge'
}

/** "the buildings to the WSW", "the ridge to the W", "higher ground to the SW". */
export function blockerWords(what: Blocker, azimuth: number): string {
  const to = `to the ${compassPoint(azimuth)}`
  return what === 'ground' ? `higher ground ${to}` : `the ${what === 'ridge' ? 'ridge' : what} ${to}`
}


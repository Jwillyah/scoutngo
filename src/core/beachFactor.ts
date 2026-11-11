import { BEACH_OBSERVATIONS, BEACH_REGIONS, type BeachRegion } from '../data/beachObservations.ts'
import { BEACH_CAP } from './surf.ts'

/*
 * THE BEACH FACTOR, PER REGION (Batch Beach, Section 2). The face is never
 * taken above the buoy's height times this (src/core/surf.ts surfEstimate):
 * the middle of what the beach showed over what the buoy read, one number per
 * region, the median of its rows in src/data/beachObservations.ts. A region
 * with no row, or a place in no region, keeps BEACH_CAP. Learned nightly
 * later; for now it moves only with a row of evidence.
 */
export function regionOf(at: { lat: number; lon: number }): BeachRegion | null {
  return BEACH_REGIONS.find((r) => at.lat >= r.south && at.lat < r.north && at.lon >= r.west && at.lon <= r.east) ?? null
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The region's factor from its observations; BEACH_CAP where there are none. */
export function regionFactor(region: BeachRegion | null): number {
  if (region === null) return BEACH_CAP
  const rows = BEACH_OBSERVATIONS.filter((o) => o.region === region.id && o.buoyFt > 0)
  return rows.length === 0 ? BEACH_CAP : median(rows.map((o) => (o.seenFt[0] + o.seenFt[1]) / 2 / o.buoyFt))
}

/** The factor at a place: its region's, else BEACH_CAP. */
export const beachFactorAt = (at: { lat: number; lon: number }): number => regionFactor(regionOf(at))

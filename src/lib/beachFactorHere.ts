import { beachFactorAt } from '../core/beachFactor.ts'
import { spotFactor } from '../core/fieldReports.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { SURF_SPOTS } from '../data/surfSpots.ts'
import { spotKey } from '../core/spotSkill.ts'
import { readReports } from './fieldReportStore.ts'

/*
 * THE BEACH FACTOR HERE (Batch Beach, Section 3): this spot's own, from your
 * field reports on this phone (three or more with a buoy beside them,
 * src/core/fieldReports.ts spotFactor), else the region's from the shared
 * looks at the beach (src/core/beachFactor.ts). Read from this phone only.
 */
/* Batch LIVE, Section 9A.4: a jetty breaks its own way; a spot within this of a listed surf spot (Croatan, 1st Street Jetty…) takes that spot's factor from the reports filed under it (the report screen's spot chips). */
export const SAME_SPOT_KM = 1.5

export function factorHere(at: LatLon, reports = readReports()): number {
  const own = spotFactor(reports, spotKey(at))
  if (own !== null) return own
  const listed = SURF_SPOTS.map((s) => ({ s, km: distanceMeters(at, s.at) / 1000 }))
    .filter((x) => x.km <= SAME_SPOT_KM)
    .sort((a, b) => a.km - b.km)[0]
  return (listed === undefined ? null : spotFactor(reports, spotKey(listed.s.at))) ?? beachFactorAt(at)
}

import { beachFactorAt } from '../core/beachFactor.ts'
import { spotFactor } from '../core/fieldReports.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { jettyOf, type Shelter } from '../core/jettyFactor.ts'
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

/*
 * Batch DRONE, Section 1.3: a jetty's seeded factor and shelter
 * (src/core/jettyFactor.ts) reach only this far from it. Croatan and 1st
 * Street Jetty are 1.7 km apart and the pier 1.3 km from the jetty: the
 * jetty's own water, not the beach either side of it.
 */
export const JETTY_WITHIN_KM = 0.5

/** The listed jetty this place is on, its size factor and shelter; null on an open beach. */
export function jettyHere(at: LatLon): { sizeFactor: number; shelter: Shelter | null } | null {
  const near = SURF_SPOTS.map((s) => ({ s, km: distanceMeters(at, s.at) / 1000 }))
    .filter((x) => x.km <= JETTY_WITHIN_KM)
    .sort((a, b) => a.km - b.km)[0]
  return near === undefined ? null : jettyOf(near.s.id)
}

export function factorHere(at: LatLon, reports = readReports()): number {
  const own = spotFactor(reports, spotKey(at))
  if (own !== null) return own
  const listed = SURF_SPOTS.map((s) => ({ s, km: distanceMeters(at, s.at) / 1000 }))
    .filter((x) => x.km <= SAME_SPOT_KM)
    .sort((a, b) => a.km - b.km)[0]
  /* Reports filed here replace the region's factor and the jetty's seed with it; with none, the region's times the jetty's (1 on an open beach). */
  return (listed === undefined ? null : spotFactor(reports, spotKey(listed.s.at))) ?? beachFactorAt(at) * (jettyHere(at)?.sizeFactor ?? 1)
}

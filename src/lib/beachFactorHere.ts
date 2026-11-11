import { beachFactorAt } from '../core/beachFactor.ts'
import { spotFactor } from '../core/fieldReports.ts'
import type { LatLon } from '../core/geo.ts'
import { spotKey } from '../core/spotSkill.ts'
import { readReports } from './fieldReportStore.ts'

/*
 * THE BEACH FACTOR HERE (Batch Beach, Section 3): this spot's own, from your
 * field reports on this phone (three or more with a buoy beside them,
 * src/core/fieldReports.ts spotFactor), else the region's from the shared
 * looks at the beach (src/core/beachFactor.ts). Read from this phone only.
 */
export function factorHere(at: LatLon, reports = readReports()): number {
  return spotFactor(reports, spotKey(at)) ?? beachFactorAt(at)
}

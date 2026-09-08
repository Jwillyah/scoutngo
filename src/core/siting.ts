/*
 * Is this a place a person can actually stand?
 *
 * The model proposes positions by looking at an image, and it puts them in
 * rivers and down the middle of roads. This checks each one against real OSM
 * geometry and REPORTS the problem. It never moves a position: a silently
 * relocated position is a worse lie than a flagged one, and the shooter is the
 * one who knows whether that pier is walkable.
 *
 * Arithmetic, so it lives in core and is never inferred.
 */

import { booleanPointInPolygon, lineString, point, pointToLineDistance, polygon } from '@turf/turf'
import { toPosition, type LatLon, type Position } from './geo.ts'

/** A closed way from OSM: the outer ring, then any holes. */
export type Ring = Position[]

export interface RoadLine {
  positions: Position[]
  /** Half the carriageway, in metres. Standing inside this is standing in traffic. */
  halfWidthMeters: number
}

export interface Landcover {
  water: Ring[][]
  roads: RoadLine[]
}

export const EMPTY_LANDCOVER: Landcover = { water: [], roads: [] }

export type SiteWarning = 'in-water' | 'in-roadway'

/** A ring needs at least three distinct points, and turf wants it closed. */
function closeRing(ring: Ring): Ring | null {
  if (ring.length < 3) return null
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
  return closed.length >= 4 ? closed : null
}

export function isInWater(at: LatLon, water: Ring[][]): boolean {
  const here = point(toPosition(at))
  for (const rings of water) {
    const closed = rings.map(closeRing).filter((r): r is Ring => r !== null)
    if (closed.length === 0) continue
    try {
      if (booleanPointInPolygon(here, polygon(closed))) return true
    } catch {
      // A malformed ring from OSM is not a reason to fail the whole check.
      continue
    }
  }
  return false
}

export function isInRoadway(at: LatLon, roads: RoadLine[]): boolean {
  const here = point(toPosition(at))
  for (const road of roads) {
    if (road.positions.length < 2) continue
    try {
      const metres = pointToLineDistance(here, lineString(road.positions), { units: 'meters' })
      if (metres <= road.halfWidthMeters) return true
    } catch {
      continue
    }
  }
  return false
}

/** Every problem with this spot. Empty means nothing was found against it. */
export function checkSite(at: LatLon, land: Landcover): SiteWarning[] {
  const warnings: SiteWarning[] = []
  if (isInWater(at, land.water)) warnings.push('in-water')
  if (isInRoadway(at, land.roads)) warnings.push('in-roadway')
  return warnings
}

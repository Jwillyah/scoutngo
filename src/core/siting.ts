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

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import lineIntersect from '@turf/line-intersect'
import pointToLineDistance from '@turf/point-to-line-distance'
import { lineString, point, polygon } from '@turf/helpers'
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
  /** Buildings and other places people gather, used for the drone path check. */
  structures: Ring[][]
  /**
   * OSM COASTLINE WAYS, which is how the SEA is mapped. Optional, because
   * everything built before this has none.
   *
   * WHY. The ocean is not a water polygon in OpenStreetMap: it is the space to
   * the right of the coastline ways. isInWater looks only at polygons, so the
   * sea was invisible to every water check, and a position placed in the surf
   * read as dry land. See isInSea.
   *
   * THE LINE IS ONLY AS GOOD AS OSM'S. At Atlantic Park the mapped coastline is
   * 41 points over 9 km and sits about 70 m seaward of the surf in the Esri
   * imagery, so the last stretch of beach reads as land either way.
   */
  coastline?: Position[][]
}

export const EMPTY_LANDCOVER: Landcover = { water: [], roads: [], structures: [] }

export type SiteWarning = 'in-water' | 'in-roadway' | 'over-structure'

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

/** How far to look for a coastline. Past this, the sea is not the question. */
export const SEA_SEARCH_METERS = 3000

/**
 * IS THIS IN THE SEA? OSM draws every coastline way with the land on its LEFT
 * and the water on its RIGHT, so the answer is which side of the nearest
 * coastline segment the point lies on.
 *
 * Planar, in metres around the point: over the few hundred metres a venue
 * spans that is exact enough, and it keeps the cross product readable. No
 * coastline within SEA_SEARCH_METERS is "not the sea", never a guess.
 */
export function isInSea(at: LatLon, coastlines: readonly Position[][]): boolean {
  const kx = 111_320 * Math.cos((at.lat * Math.PI) / 180)
  const ky = 110_540
  const local = ([lon, lat]: Position) => [(lon - at.lon) * kx, (lat - at.lat) * ky] as const
  let best = Infinity
  let side = 0
  for (const way of coastlines) {
    for (let i = 0; i + 1 < way.length; i++) {
      const [ax, ay] = local(way[i])
      const [bx, by] = local(way[i + 1])
      const dx = bx - ax
      const dy = by - ay
      const length2 = dx * dx + dy * dy
      if (length2 === 0) continue
      /* The point is the origin; t is how far along the segment its foot lies. */
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2))
      const fx = ax + t * dx
      const fy = ay + t * dy
      const distance = Math.hypot(fx, fy)
      if (distance < best) {
        best = distance
        /* Cross of the segment with the point: negative is to the right, the water side. */
        side = dx * (0 - ay) - dy * (0 - ax)
      }
    }
  }
  return best <= SEA_SEARCH_METERS && side < 0
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

/**
 * Does the straight line from a drone to its subject pass over a building or
 * another place people gather?
 *
 * This is a PROXY, not an FAA compliance check. OpenStreetMap has no crowd data,
 * so buildings, parking, and pedestrian areas stand in for "people are probably
 * under here". docs/brief.md roadmap item 4: the DJI Air 3S is about 720 grams,
 * so it does not qualify for FAA Category 1 operations over people, which is why
 * this is worth flagging at all. It is a prompt to look, not a clearance.
 */
export function pathCrossesStructure(from: LatLon, to: LatLon, structures: Ring[][]): boolean {
  if (structures.length === 0) return false
  let path
  try {
    path = lineString([toPosition(from), toPosition(to)])
  } catch {
    return false
  }

  for (const rings of structures) {
    const closed = rings.map(closeRing).filter((r): r is Ring => r !== null)
    if (closed.length === 0) continue
    try {
      const shape = polygon(closed)
      // Either the line clips an edge, or it starts inside and never leaves.
      if (lineIntersect(path, shape).features.length > 0) return true
      if (booleanPointInPolygon(point(toPosition(from)), shape)) return true
      if (booleanPointInPolygon(point(toPosition(to)), shape)) return true
    } catch {
      continue
    }
  }
  return false
}

export interface SiteContext {
  /** Air positions are judged on their flight path, not on the ground beneath. */
  platform: 'ground' | 'air'
  subject: LatLon
}

/** Every problem with this spot. Empty means nothing was found against it. */
export function checkSite(at: LatLon, land: Landcover, context?: SiteContext): SiteWarning[] {
  const warnings: SiteWarning[] = []

  // A drone is not standing anywhere, so water and roads underneath are fine.
  if (context?.platform !== 'air') {
    if (isInWater(at, land.water) || isInSea(at, land.coastline ?? [])) warnings.push('in-water')
    if (isInRoadway(at, land.roads)) warnings.push('in-roadway')
  } else if (pathCrossesStructure(at, context.subject, land.structures)) {
    warnings.push('over-structure')
  }

  return warnings
}

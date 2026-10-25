/*
 * WHERE THE BUILDINGS' SHADOWS FALL, WORKED OUT, NOT RENDERED.
 *
 * WHY THIS IS ARITHMETIC AND NOT A 3D ENGINE. A shadow on flat ground is the
 * building's footprint swept along the shadow bearing by height / tan(sun
 * altitude). That is a polygon this file can compute exactly from the
 * footprint and the sun, offline, for any time the scrubber is on, and test.
 * A rendered shadow would be a picture of a guess about the light model.
 *
 * WHAT IS EXACT AND WHAT IS NOT.
 *
 *   EXACT: `parts`. The swept area of a polygon translated along a straight
 *   line is the union of the footprint, the translated footprint, and one
 *   quadrilateral per edge (the edge and its translated copy). A point is in
 *   the shadow exactly when it is in one of those parts, whatever the shape
 *   of the footprint, so pointInShadow reads `parts`.
 *
 *   FOR DRAWING: `hull`, the convex hull of footprint and translated
 *   footprint, one ring per building. Identical to the swept area for a
 *   convex footprint; LARGER for a concave one (an L-shaped block fills its
 *   inside corner). `hullExact` says which, so a caller drawing the hull can
 *   say so instead of claiming shade that is not there.
 *
 * FLAT GROUND. Terrain is not consulted: on a slope a shadow is longer
 * downhill and shorter uphill. Said wherever this is shown.
 *
 * NO HEIGHT, NO SHADOW. A footprint OpenStreetMap gives no height for casts
 * nothing here and is counted in `skippedNoHeight`, so the legend can say how
 * many buildings were left out. Inventing a height would draw shade from a
 * number nobody measured.
 */
import { destinationPoint, distanceMeters, type LatLon, type Position } from './geo.ts'
import { normalizeBearing } from './sun.ts'

const DEG = Math.PI / 180

/**
 * The longest shadow drawn, in metres.
 *
 * WHY A CAP. Length is height / tan(altitude), which runs to infinity as the
 * sun reaches the horizon: a 10 m building at half a degree throws 1.1 km, at
 * a tenth of a degree 5.7 km. Long before that the shadow has dissolved into
 * the general dusk and stopped being a shape anyone plans around, and the
 * polygon would cover the whole map. Capped here, and `capped` says when, so
 * the caller can say the real shadow is longer.
 */
export const MAX_SHADOW_METERS = 1000

export interface FootprintIn {
  id: string
  /** [lon, lat], closed or open; the closing point is ignored if repeated. */
  ring: Position[]
  heightMeters: number | null
}

export interface SunIn {
  /** Compass degrees, 0 north, clockwise. */
  azimuth: number
  /** Degrees above the horizon. */
  altitude: number
}

export interface BuildingShadow {
  id: string
  /** The exact swept area, as several rings whose union is the shadow. */
  parts: Position[][]
  /** One ring for drawing. Exact for a convex footprint, larger for a concave one. */
  hull: Position[]
  hullExact: boolean
  lengthMeters: number
  /** Compass degrees the shadow points along: away from the sun. */
  bearing: number
  /** True when the length was cut to MAX_SHADOW_METERS. */
  capped: boolean
}

export type ShadowMap =
  | {
      status: 'ok'
      shadows: BuildingShadow[]
      /** Buildings with no known height: no shadow drawn, said in the legend. */
      skippedNoHeight: number
      /** True when any shadow hit MAX_SHADOW_METERS. */
      anyCapped: boolean
    }
  | { status: 'no-sun'; reason: string; skippedNoHeight: number }

/** Length of the shadow a thing this tall casts, uncapped. Null with the sun down. */
function rawLength(heightMeters: number, altitude: number): number | null {
  if (!(altitude > 0)) return null
  return heightMeters / Math.tan(altitude * DEG)
}

/** A ring without its repeated closing point, at least three vertices, or null. */
function openRing(ring: Position[]): Position[] | null {
  if (ring.length < 3) return null
  const first = ring[0]
  const last = ring[ring.length - 1]
  const open = first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
  return open.length >= 3 ? open : null
}

const close = (ring: Position[]): Position[] => [...ring, ring[0]]

/** Shift every vertex the same distance along one bearing. */
function translate(ring: Position[], bearing: number, meters: number): Position[] {
  if (meters === 0) return ring.map((p) => [p[0], p[1]] as Position)
  return ring.map(([lon, lat]) => {
    const moved = destinationPoint({ lat, lon }, bearing, meters)
    return [moved.lon, moved.lat] as Position
  })
}

const cross = (o: Position, a: Position, b: Position) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Andrew's monotone chain. Planar over a building's few hundred metres. */
export function convexHull(points: Position[]): Position[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const lower: Position[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Position[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Whether a ring is convex: every turn the same way. */
function isConvex(ring: Position[]): boolean {
  let sign = 0
  for (let i = 0; i < ring.length; i++) {
    const turn = cross(ring[i], ring[(i + 1) % ring.length], ring[(i + 2) % ring.length])
    if (turn === 0) continue
    if (sign === 0) sign = Math.sign(turn)
    else if (Math.sign(turn) !== sign) return false
  }
  return true
}

export function shadowMap(footprints: readonly FootprintIn[], sun: SunIn): ShadowMap {
  const withHeight = footprints.filter(
    (f) => f.heightMeters !== null && Number.isFinite(f.heightMeters) && f.heightMeters > 0,
  )
  const skippedNoHeight = footprints.length - withHeight.length
  if (!(sun.altitude > 0)) {
    return {
      status: 'no-sun',
      reason: 'The sun is down at this time, so nothing casts a shadow.',
      skippedNoHeight,
    }
  }

  const bearing = normalizeBearing(sun.azimuth + 180)
  const shadows: BuildingShadow[] = []
  for (const footprint of withHeight) {
    const ring = openRing(footprint.ring)
    if (ring === null) continue
    const raw = rawLength(footprint.heightMeters as number, sun.altitude) as number
    const capped = raw > MAX_SHADOW_METERS
    const length = capped ? MAX_SHADOW_METERS : raw
    const moved = translate(ring, bearing, length)
    const parts: Position[][] = [close(ring), close(moved)]
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length
      parts.push(close([ring[i], ring[j], moved[j], moved[i]]))
    }
    shadows.push({
      id: footprint.id,
      parts,
      hull: close(convexHull([...ring, ...moved])),
      hullExact: isConvex(ring),
      lengthMeters: length,
      bearing,
      capped,
    })
  }
  return { status: 'ok', shadows, skippedNoHeight, anyCapped: shadows.some((s) => s.capped) }
}

/** Ray casting on a [lon, lat] ring. */
function inRing(ring: Position[], at: LatLon): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > at.lat !== yj > at.lat && at.lon < ((xj - xi) * (at.lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Which building's shadow a point is in, or null.
 *
 * Null means no MAPPED building with a known height shades it. It does not
 * mean the point is in sun: a tree, an awning or a building OSM gives no
 * height for can still shade it, and the caller says so.
 */
export function pointInShadow(at: LatLon, map: ShadowMap): string | null {
  if (map.status !== 'ok') return null
  for (const shadow of map.shadows) {
    if (shadow.parts.some((part) => inRing(part, at))) return shadow.id
  }
  return null
}

/**
 * THE SHADOW A SUBJECT THROWS: a person, a tent, a stage, given its height.
 *
 * Width does not change the length, only how broad the shadow is, and it is
 * returned so a caller can draw the patch. Null with the sun down.
 */
export function subjectShadow(
  heightMeters: number,
  widthMeters: number,
  sun: SunIn,
): { lengthMeters: number; bearing: number; widthMeters: number; capped: boolean } | null {
  const raw = rawLength(heightMeters, sun.altitude)
  if (raw === null || !(heightMeters > 0)) return null
  return {
    lengthMeters: Math.min(raw, MAX_SHADOW_METERS),
    bearing: normalizeBearing(sun.azimuth + 180),
    widthMeters,
    capped: raw > MAX_SHADOW_METERS,
  }
}

/** For tests and callers checking a drawn shadow: the offset between a vertex and its shadow. */
export function vertexOffset(from: Position, to: Position): number {
  return distanceMeters({ lon: from[0], lat: from[1] }, { lon: to[0], lat: to[1] })
}

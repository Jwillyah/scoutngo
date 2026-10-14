/*
 * Map geometry. Bearings, distances, and the field of view cone.
 *
 * This is in core because it is arithmetic, which means it is never inferred.
 * A model may propose that a shooter stands on the south bank. It never says
 * which way that camera points or how wide the lens sees. Those come from here
 * and from fov.ts, and they override anything a model claims.
 *
 * Unlike the rest of core this file does depend on turf, which is the geodesy
 * library named in docs/brief.md. Nothing here is hand rolled.
 *
 * The scoped packages are imported one by one rather than through the @turf/turf
 * barrel. The barrel re-exports every turf module, so importing `bearing` from it
 * pulled the whole library into the bundle; these four are what this file uses.
 */

import turfBearing from '@turf/bearing'
import destination from '@turf/destination'
import distance from '@turf/distance'
import { point } from '@turf/helpers'
import rhumbDestination from '@turf/rhumb-destination'
import { normalizeBearing } from './sun.ts'

export interface LatLon {
  lat: number
  lon: number
}

/** GeoJSON uses [lon, lat]. Getting this backwards is the classic bug. */
export type Position = [number, number]

export const toPosition = (p: LatLon): Position => [p.lon, p.lat]

/**
 * Compass bearing FROM one point TO another, 0 to 360 clockwise from north.
 * turf returns -180 to 180, so it is normalised here.
 */
export function bearingBetween(from: LatLon, to: LatLon): number {
  return normalizeBearing(turfBearing(point(toPosition(from)), point(toPosition(to))))
}

export function distanceMeters(from: LatLon, to: LatLon): number {
  return distance(point(toPosition(from)), point(toPosition(to)), { units: 'meters' })
}

/** Point reached by travelling `meters` along `bearing` from `origin`. */
export function destinationPoint(origin: LatLon, bearing: number, meters: number): LatLon {
  const moved = destination(point(toPosition(origin)), meters, normalizeBearing(bearing), {
    units: 'meters',
  })
  const [lon, lat] = moved.geometry.coordinates as Position
  return { lat, lon }
}

/**
 * The field of view cone: apex at the camera, opening `fovDegrees` wide,
 * centred on `bearing`, out to `rangeMeters`.
 *
 * `fovDegrees` must be the computed hFOV from fov.ts. Do not pass a guess.
 */
export function fovConePolygon(
  apex: LatLon,
  bearing: number,
  fovDegrees: number,
  rangeMeters: number,
  steps = 24,
): Position[][] {
  const half = fovDegrees / 2
  const ring: Position[] = [toPosition(apex)]

  for (let i = 0; i <= steps; i++) {
    const edge = bearing - half + (fovDegrees * i) / steps
    ring.push(toPosition(destinationPoint(apex, edge, rangeMeters)))
  }

  ring.push(toPosition(apex))
  return [ring]
}

/**
 * Point reached by holding a CONSTANT COMPASS BEARING for `meters` from
 * `origin`. A rhumb line, not a great circle.
 *
 * WHICH ONE A BEARING LINE NEEDS, AND WHY IT IS THIS ONE.
 *
 * `destinationPoint` above is a great circle, which is the shortest path and
 * the right answer for "how far away is that". It is the wrong answer for
 * "which way is the sun", because a great circle does not hold its bearing: it
 * leaves on the bearing asked for and arrives on a different one.
 *
 * It also matters for how the line is DRAWN. A two point LineString is
 * rendered as a straight segment in projected space, and in Mercator a rhumb
 * line is exactly that straight segment, so the drawn line is the true
 * constant bearing line at any length. With a great circle endpoint it is a
 * chord across one, and the error grows with the square of the length:
 * measured against a true constant bearing at a 390x844 viewport, the far end
 * of a sun line sized to the frame sat 0.02px off at zoom 18 and 5.0px off at
 * zoom 10. Five pixels of skew on the line whose whole job is to point.
 */
export function rhumbPoint(origin: LatLon, bearing: number, meters: number): LatLon {
  const moved = rhumbDestination(point(toPosition(origin)), meters, normalizeBearing(bearing), {
    units: 'meters',
  })
  const [lon, lat] = moved.geometry.coordinates as Position
  return { lat, lon }
}

/**
 * The latitude Web Mercator stops at. Past this there is no map to draw on:
 * maplibre clamps here too, and the poles project to infinity.
 */
export const MERCATOR_MAX_LAT = 85.051129

/** The sphere turf measures on. Same value as @turf/helpers earthRadius. */
const TURF_EARTH_RADIUS = 6371008.8

/**
 * The far end of a bearing line: a rhumb point, kept on the map.
 *
 * WHY THE CLAMP. A rhumb line heading north eventually runs over the pole, and
 * turf keeps going: from 89.9N, 131km due north comes back as 88.92N on the
 * SAME longitude, which as a drawn line points south. Nothing about that fails
 * loudly, it just silently reverses the line whose only job is to point, so it
 * is cut at the edge of the projection instead. Reachable because a bearing
 * line is now as long as the viewport is wide, which at a wide zoom is over a
 * degree of latitude.
 *
 * Shortening the line here cannot hide it inside the frame, because the frame
 * cannot extend past the projection either.
 */
export function bearingLineEnd(origin: LatLon, bearing: number, meters: number): LatLon {
  const heading = (normalizeBearing(bearing) * Math.PI) / 180
  const northing = Math.cos(heading)
  // Due east or west never changes latitude, so there is no limit to reach.
  if (Math.abs(northing) < 1e-12) return rhumbPoint(origin, bearing, meters)

  /*
   * Along a rhumb, latitude advances linearly with distance: the northward
   * component is d/R * cos(bearing). So the distance that lands exactly on the
   * limit is solvable, which is what this does. Scaling the overshot point
   * instead would not work, because once it has crossed the pole its latitude
   * is going the wrong way and there is nothing to interpolate against.
   *
   * TURF_EARTH_RADIUS has to match the radius rhumbDestination uses, or the
   * clamp lands slightly past the limit it is there to respect.
   */
  const limit = northing > 0 ? MERCATOR_MAX_LAT : -MERCATOR_MAX_LAT
  const toLimit =
    (TURF_EARTH_RADIUS * ((limit - origin.lat) * Math.PI)) / 180 / northing
  return rhumbPoint(origin, bearing, Math.max(0, Math.min(meters, toLimit)))
}

/**
 * A line through `centre` along `azimuth`, running `halfLengthMeters` in each
 * direction. Used to lay the sun's direction across the map.
 *
 * `halfLengthMeters` should come from bearingLineMeters in viewport.ts, so the
 * line runs off the edge of whatever the frame is currently showing. A bearing
 * has no length of its own.
 */
export function axisLine(
  centre: LatLon,
  azimuth: number,
  halfLengthMeters: number,
): Position[] {
  return [
    toPosition(bearingLineEnd(centre, azimuth + 180, halfLengthMeters)),
    toPosition(bearingLineEnd(centre, azimuth, halfLengthMeters)),
  ]
}

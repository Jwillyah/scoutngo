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
 * A line through `centre` along `azimuth`, running `halfLengthMeters` in each
 * direction. Used to lay the sun's direction across the map.
 */
export function axisLine(
  centre: LatLon,
  azimuth: number,
  halfLengthMeters: number,
): Position[] {
  return [
    toPosition(destinationPoint(centre, azimuth + 180, halfLengthMeters)),
    toPosition(destinationPoint(centre, azimuth, halfLengthMeters)),
  ]
}

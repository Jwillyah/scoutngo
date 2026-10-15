/*
 * WHAT A TOP-DOWN AND A 360 ACTUALLY SEE, AS GEOMETRY ON THE MAP.
 *
 * A cone is a claim about a direction, and neither of these has one. Drawing
 * either as a cone would be drawing the thing src/core/shotType.ts refuses to
 * assert. So they get the shapes they really have:
 *
 *   TOP-DOWN   a rectangle on the ground, sized by the altitude and the
 *              sensor, turned by the yaw. Nothing about it is a bearing.
 *   360        a ring at the distance the horizon actually sits, with the
 *              sun's bearing marked on it.
 *
 * Every number here is arithmetic from the altitude and the field of view.
 * Nothing is a judgement and nothing comes from a model.
 */

import { destinationPoint, toPosition, type LatLon, type Position } from './geo.ts'
import { feetToMeters } from './reachScale.ts'
import { clampAltitudeFeet } from './air.ts'

const DEG = Math.PI / 180

/**
 * How much ground a nadir frame covers, in metres.
 *
 *   width  = 2 * h * tan(hFOV / 2)
 *   height = 2 * h * tan(vFOV / 2)
 *
 * The same frameWidthMeters arithmetic as src/core/fov.ts, with the altitude
 * as the range, because straight down the range IS the altitude. Both axes,
 * because a rectangle needs both and the vertical one is the cut most
 * deliverables are made on.
 */
export interface FootprintSize {
  widthMeters: number
  heightMeters: number
  /** Corner to corner, which is what the shadow line is scaled against. */
  diagonalMeters: number
}

export function footprintSize(
  altitudeFeet: number,
  hFOV: number,
  vFOV: number,
): FootprintSize {
  const altitude = feetToMeters(clampAltitudeFeet(altitudeFeet))
  const widthMeters = 2 * altitude * Math.tan((hFOV / 2) * DEG)
  const heightMeters = 2 * altitude * Math.tan((vFOV / 2) * DEG)
  return {
    widthMeters,
    heightMeters,
    diagonalMeters: Math.hypot(widthMeters, heightMeters),
  }
}

/**
 * The rectangle itself, as a closed ring.
 *
 * `yawDegrees` turns the frame's LONG axis. It is not a camera bearing: the
 * camera points at the ground whatever the yaw says, and this is the only
 * thing the yaw affects. The rectangle is centred on the point the camera is
 * directly above.
 *
 * Built by stepping along the yaw and then across it, rather than by rotating
 * a flat rectangle, so the corners are real coordinates at real distances
 * instead of a planar approximation that drifts with latitude.
 */
export function groundFootprint(
  centre: LatLon,
  altitudeFeet: number,
  hFOV: number,
  vFOV: number,
  yawDegrees: number,
): Position[][] {
  const { widthMeters, heightMeters } = footprintSize(altitudeFeet, hFOV, vFOV)
  if (widthMeters <= 0 || heightMeters <= 0) return []

  const alongHalf = heightMeters / 2
  const acrossHalf = widthMeters / 2
  const along = yawDegrees
  const across = yawDegrees + 90

  const corner = (forward: number, right: number): Position => {
    const moved = destinationPoint(centre, along, forward * alongHalf)
    return toPosition(destinationPoint(moved, across, right * acrossHalf))
  }

  const ring = [
    corner(1, -1),
    corner(1, 1),
    corner(-1, 1),
    corner(-1, -1),
  ]
  // Closed, because a polygon ring that does not close is not a polygon.
  return [[...ring, ring[0]]]
}

/**
 * HOW FAR THE HORIZON IS FROM AN AIRCRAFT, in metres.
 *
 *   d = sqrt(2 * R * h + h * h)
 *
 * The geometric horizon for a sphere, ignoring refraction, which lifts it a
 * few percent further. At 200ft that is about 27.8km and at 400ft about
 * 39.3km, which is genuinely the edge of what a 360 from there contains: the
 * ring in a little planet IS this circle.
 *
 * It is drawn at true scale rather than as a schematic at a convenient radius.
 * A circle drawn at three hundred metres and labelled "horizon" would be a
 * picture of a number that is not the number.
 */
const EARTH_RADIUS_METERS = 6_371_008.8

export function horizonDistanceMeters(altitudeFeet: number): number {
  const h = feetToMeters(clampAltitudeFeet(altitudeFeet))
  return Math.sqrt(2 * EARTH_RADIUS_METERS * h + h * h)
}

/**
 * The ring, as a closed line.
 *
 * A LineString rather than a filled polygon: it is the edge of what the shot
 * contains, not an area the shot covers. Filling it would read as a footprint,
 * which is the top-down's shape and means something different.
 */
export function horizonRing(
  centre: LatLon,
  radiusMeters: number,
  steps = 72,
): Position[] {
  if (radiusMeters <= 0 || steps < 3) return []
  const ring: Position[] = []
  for (let i = 0; i < steps; i++) {
    ring.push(toPosition(destinationPoint(centre, (i * 360) / steps, radiusMeters)))
  }
  ring.push(ring[0])
  return ring
}

/**
 * Where the sun sits on that ring, as a short radial tick.
 *
 * A tick rather than a dot, because the thing being marked is a DIRECTION and
 * a dot on a circle at this scale reads as a place. It runs from just inside
 * the ring to just outside it.
 */
export function sunTickOnRing(
  centre: LatLon,
  sunBearing: number,
  radiusMeters: number,
  lengthShare = 0.12,
): Position[] {
  if (radiusMeters <= 0) return []
  const half = (radiusMeters * lengthShare) / 2
  return [
    toPosition(destinationPoint(centre, sunBearing, Math.max(0, radiusMeters - half))),
    toPosition(destinationPoint(centre, sunBearing, radiusMeters + half)),
  ]
}

/**
 * The shadow direction drawn ACROSS a top-down frame, as a line through its
 * centre.
 *
 * This is what the yaw is for: you choose it freely, so being able to see the
 * shadows against the frame is the point of being able to set it. Scaled to
 * the frame's own diagonal so it always spans the rectangle and never
 * overshoots it by much, whatever the yaw.
 */
export function shadowAcrossFootprint(
  centre: LatLon,
  shadowBearing: number,
  diagonalMeters: number,
): Position[] {
  if (diagonalMeters <= 0) return []
  const half = diagonalMeters / 2
  return [
    toPosition(destinationPoint(centre, shadowBearing + 180, half)),
    toPosition(destinationPoint(centre, shadowBearing, half)),
  ]
}

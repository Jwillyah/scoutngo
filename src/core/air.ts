/*
 * WHAT BEING IN THE AIR DOES TO THE ARITHMETIC.
 *
 * The app has had air positions, drone cameras and an altitude figure for a
 * while, but the altitude was only ever PRINTED. Every geometric number was
 * computed as though the aircraft were standing on the ground at the point on
 * the map, and that is not a rounding error:
 *
 *   drone 200ft AGL, Air 3S wide, directly over the subject
 *     computed    range 0m, frame width 0.0m, no warning
 *     true        slant range 61m, frame width 91m, frame too wide
 *
 *   drone 200ft AGL, 25m horizontally from the subject
 *     computed    range 25m, frame width 37.4m, no warning
 *     true        slant range 66m, frame width 98.6m, frame too wide
 *
 * A position hovering over the subject was reported as framing nothing at all,
 * and reported as fine. So the altitude is in the geometry now, and this is
 * where that arithmetic lives.
 *
 * NOTHING HERE IS A LEGAL JUDGEMENT. There is a 400ft cap on the altitude
 * field and a measured distance from the pilot to the aircraft, and both are
 * numbers. Neither says a flight is permitted, cleared, compliant, or within
 * anything. That call belongs to the person flying, who can see the site, the
 * airspace and the day; this file can only measure.
 */

import { distanceMeters, type LatLon } from './geo.ts'
import { feetToMeters } from './reachScale.ts'

/** What a new air position starts at. A working height, not a recommendation. */
export const DEFAULT_ALTITUDE_FEET = 200

/**
 * The top of the altitude field.
 *
 * 400 feet AGL is the altitude limit in FAA Part 107. It is here as the ceiling
 * of the input because a field that accepts 1200 is a field that invites a
 * number nobody is going to fly, not because staying under it makes a flight
 * lawful: that depends on the airspace, the waiver, the aircraft and the
 * operator, none of which this app knows.
 */
export const MAX_ALTITUDE_FEET = 400

/** The floor. Zero would be a ground position wearing an air label. */
export const MIN_ALTITUDE_FEET = 10

export function clampAltitudeFeet(feet: number): number {
  if (!Number.isFinite(feet)) return DEFAULT_ALTITUDE_FEET
  return Math.min(MAX_ALTITUDE_FEET, Math.max(MIN_ALTITUDE_FEET, Math.round(feet)))
}

/**
 * How far the camera actually is from the subject: the hypotenuse, not the
 * horizontal leg.
 *
 * This is the number everything downstream of a position's range needs. Frame
 * width, the standoff band and the framing warnings are all functions of the
 * distance from the lens to the subject, and for an aircraft that distance is
 * never the distance between two points on a map.
 */
export function slantRangeMeters(horizontalMeters: number, altitudeFeet: number): number {
  return Math.hypot(Math.max(0, horizontalMeters), feetToMeters(clampAltitudeFeet(altitudeFeet)))
}

/**
 * How far down the camera has to point to hold the subject, in degrees below
 * the horizon. 90 is straight down.
 *
 * Worth having because it is what tells you the shot is a top-down rather than
 * an oblique, which changes what the frame contains more than the range does.
 */
export function depressionDegrees(horizontalMeters: number, altitudeFeet: number): number {
  const altitude = feetToMeters(clampAltitudeFeet(altitudeFeet))
  const horizontal = Math.max(0, horizontalMeters)
  if (horizontal === 0) return 90
  return Math.atan(altitude / horizontal) * (180 / Math.PI)
}

/**
 * A measured separation between where the pilot is standing and where the
 * aircraft is, in metres.
 *
 * TWO NUMBERS, BECAUSE THEY ARE DIFFERENT QUESTIONS. The horizontal is the
 * distance across the ground, which is what you pace out and what a map
 * measures. The slant is the actual distance from the pilot to the aircraft,
 * which at 400ft is 122m of it before any horizontal distance at all.
 *
 * IT IS A MEASUREMENT AND NOT A CLEARANCE. These numbers do not say whether
 * the aircraft can be seen, whether line of sight is maintained, or whether
 * the flight is permitted. They say how far apart two points are.
 */
export interface PilotSeparation {
  horizontalMeters: number
  slantMeters: number
  altitudeFeet: number
}

export function pilotSeparation(
  pilot: LatLon,
  aircraft: LatLon,
  altitudeFeet: number,
): PilotSeparation {
  const horizontalMeters = distanceMeters(pilot, aircraft)
  return {
    horizontalMeters,
    slantMeters: slantRangeMeters(horizontalMeters, altitudeFeet),
    altitudeFeet: clampAltitudeFeet(altitudeFeet),
  }
}

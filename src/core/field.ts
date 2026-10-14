/*
 * Arithmetic that only FIELD needs: where to point, where to walk, and whether
 * the light has moved since the plan was made.
 *
 * A NEW FILE rather than additions to geo.ts or lighting.ts, so nothing that was
 * already correct and tested had to be reopened to add a feature.
 *
 * Everything here composes functions that already exist. Nothing re-derives a
 * bearing, a distance or a lighting class: walkTo calls the same turf-backed
 * geo.ts the cones are drawn from, and lightingChange compares two results that
 * classifyLighting produced. FIELD shows the same numbers PLAN shows, at a
 * different moment.
 */

import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import type { Classification } from './lighting.ts'
import { metersToFeet } from './reachScale.ts'
import { normalizeBearing } from './sun.ts'

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

/**
 * The 16 point compass name for a bearing.
 *
 * A number alone is hard to act on while holding a camera; "137° SE" can be
 * checked against the sun or the water without reading a needle.
 */
export function compassPoint(bearing: number): string {
  return COMPASS_POINTS[Math.round(normalizeBearing(bearing) / 22.5) % 16]
}

export interface WalkTo {
  /** Compass bearing from where you are standing to the position. */
  bearing: number
  compass: string
  meters: number
  feet: number
  /** True once you are close enough that a bearing stops being meaningful. */
  arrived: boolean
  /**
   * True when you are far enough away that a bearing is not walking advice.
   *
   * The card shows the plain distance and nothing else in this case. See
   * TOO_FAR_TO_WALK_METERS.
   */
  farAway: boolean
}

/**
 * Within this many metres, call it arrived. GPS on a phone is good to roughly
 * five metres on a clear day and much worse beside a building, so pointing
 * someone at a bearing from three metres away is pointing them at noise.
 */
export const ARRIVED_METERS = 10

/**
 * Past this, "walk to here" is the wrong sentence.
 *
 * WHY THIS EXISTS. Opening Field at home showed "9011m" and a compass bearing,
 * which is true and useless: it is a straight line across a county, through
 * buildings and a river, and nobody is walking it. A bearing is walking advice,
 * and walking advice is only advice once you are close enough for a straight
 * line to resemble the route.
 *
 * Two kilometres is about twenty minutes on foot and roughly where a bearing
 * stops being a direction you walk and starts being a direction you drive. Past
 * it the card says how far away you are, plainly, and stops talking.
 */
export const TOO_FAR_TO_WALK_METERS = 2000

/** Where to walk, from wherever the phone currently thinks it is. */
export function walkTo(from: LatLon, to: LatLon): WalkTo {
  const meters = distanceMeters(from, to)
  const bearing = bearingBetween(from, to)
  return {
    bearing,
    compass: compassPoint(bearing),
    meters,
    feet: metersToFeet(meters),
    arrived: meters <= ARRIVED_METERS,
    farAway: meters > TOO_FAR_TO_WALK_METERS,
  }
}

/**
 * How far away, in the largest unit that still says something.
 *
 * Metres below a kilometre, kilometres above it to one place. Deliberately
 * coarse: a figure that says 9043 m implies the app knows where you are to the
 * metre, and it does not.
 */
export function awayLabel(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return 'an unknown distance'
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export interface LightingChange {
  planned: Classification
  now: Classification
}

/**
 * Has the light moved off what the plan assumed?
 *
 * THE MOST USEFUL THING FIELD CAN SAY. A plan is made at one moment and shot at
 * another, and between those two the sun keeps going. A position that was
 * front-lit when it was chosen can be side-lit by the time anyone stands on it,
 * and the whole reason this tool exists is to not be wrong about that.
 *
 * Null when nothing has changed, so the card stays quiet unless there is
 * something to say.
 */
export function lightingChange(
  planned: Classification,
  now: Classification,
): LightingChange | null {
  return planned === now ? null : { planned, now }
}

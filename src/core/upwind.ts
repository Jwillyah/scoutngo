/*
 * WHICH CAMERA SHOWS YOU WHAT IS ABOUT TO ARRIVE.
 *
 * A webcam pointing at the sky is only useful if it is UPWIND. A cam downwind
 * of you is showing weather that has already gone past; a cam upwind is
 * showing the next hour. Ranking a list by distance, which is the obvious
 * thing, puts the nearest cam first whether or not it has anything to tell
 * you.
 *
 * TWO NUMBERS DECIDE IT.
 *
 * How far OFF the wind a cam sits, which is whether it is upwind at all. And
 * how long until the weather over it reaches you, which is the number that
 * says whether to look at it now or at the end of the shoot.
 *
 * WIND DIRECTION IS WHERE THE WIND COMES FROM. That is the meteorological
 * convention and it is also what every source this app could use reports, so
 * "upwind" is the direction the wind is blowing FROM: a cam whose bearing from
 * the venue equals the wind direction is directly upwind. Getting this
 * backwards would rank the list exactly wrong, which is why it is stated here
 * and asserted in the tests.
 *
 * PURE, AND DELIBERATELY PROVIDER AGNOSTIC. It ranks anything with an id and a
 * coordinate. Which cameras go into the list is a separate question with a
 * privacy answer attached, and nothing here depends on it.
 */

import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { normalizeBearing } from './sun.ts'

export interface Wind {
  /** Compass bearing the wind is coming FROM, in degrees. */
  fromDegrees: number
  /** Metres per second. */
  speedMps: number
}

export interface Upwindable {
  id: string
  at: LatLon
}

/**
 * How far off the wind a bearing sits, 0 to 180.
 *
 * Zero is directly upwind, 180 is directly downwind.
 */
export function offWindDegrees(bearingFromVenue: number, windFromDegrees: number): number {
  const d = Math.abs(normalizeBearing(bearingFromVenue) - normalizeBearing(windFromDegrees))
  return Math.min(d, 360 - d)
}

/**
 * How wide a cone still counts as upwind.
 *
 * A JUDGEMENT, not physics, and it is here rather than inside a condition for
 * that reason. Sixty degrees either side: wide enough that a cam does not have
 * to be perfectly placed to be worth a look, narrow enough that something off
 * to the side is not sold as telling you what is coming. Beyond it a cam is
 * reported with its angle rather than hidden, because where a cam sits is a
 * fact and whether it is useful is the reader's call.
 */
export const UPWIND_CONE_DEGREES = 60

/**
 * How long until what is over there gets here, in minutes.
 *
 * distance along the wind, divided by the wind speed. Only the COMPONENT along
 * the wind counts: a cam 50km away but 60 degrees off the wind is 25km upwind
 * of you, not 50, because weather travels along the wind rather than toward
 * you.
 *
 * Null in a calm, because dividing by a wind speed of zero is not a long lead
 * time, it is an absence of one: in still air that cloud is not coming at all.
 */
export function leadMinutes(
  distanceMetersFromVenue: number,
  offWind: number,
  speedMps: number,
): number | null {
  if (speedMps <= 0.5) return null
  if (offWind >= 90) return null
  const along = distanceMetersFromVenue * Math.cos((offWind * Math.PI) / 180)
  if (along <= 0) return null
  return along / speedMps / 60
}

export interface UpwindRank<T extends Upwindable> {
  item: T
  /** Bearing from the venue to it. */
  bearingDegrees: number
  /** How far off the wind that bearing is, 0 to 180. */
  offWindDegrees: number
  distanceMeters: number
  /** Minutes until the weather over it reaches the venue. Null in a calm. */
  leadMinutes: number | null
  /** Inside UPWIND_CONE_DEGREES, so it is showing you what is coming. */
  isUpwind: boolean
}

/**
 * The list, ranked.
 *
 * UPWIND FIRST, THEN SOONEST. Everything inside the cone comes before
 * everything outside it, because being upwind at all is the difference between
 * a useful cam and a pretty one. Within the cone the shortest lead time wins:
 * the cloud you will be shooting in twenty minutes matters more than the one
 * arriving at lunchtime. Outside the cone, nearest first, since the only thing
 * left to order by is how local it is.
 *
 * Nothing is dropped. A cam directly downwind is still a cam, and it is listed
 * with its angle so the reader can see why it is at the bottom.
 */
export function rankUpwind<T extends Upwindable>(
  venue: LatLon,
  items: readonly T[],
  wind: Wind,
): UpwindRank<T>[] {
  const ranked = items.map((item) => {
    const bearingDegrees = bearingBetween(venue, item.at)
    const off = offWindDegrees(bearingDegrees, wind.fromDegrees)
    const metres = distanceMeters(venue, item.at)
    return {
      item,
      bearingDegrees,
      offWindDegrees: off,
      distanceMeters: metres,
      leadMinutes: leadMinutes(metres, off, wind.speedMps),
      isUpwind: off <= UPWIND_CONE_DEGREES,
    }
  })

  return ranked.sort((a, b) => {
    if (a.isUpwind !== b.isUpwind) return a.isUpwind ? -1 : 1
    if (a.isUpwind) {
      /*
       * A cam with no lead time is in a calm or at right angles to the wind, so
       * it sorts after the ones that have one rather than counting as instant.
       */
      if (a.leadMinutes === null && b.leadMinutes === null) {
        return a.distanceMeters - b.distanceMeters
      }
      if (a.leadMinutes === null) return 1
      if (b.leadMinutes === null) return -1
      return a.leadMinutes - b.leadMinutes
    }
    return a.distanceMeters - b.distanceMeters
  })
}

/*
 * TWO PINS: HOW FAR, AND WHICH WAY.
 *
 * Drop one pin and then another; the answer is the ground distance between
 * them and the compass bearing from the first to the second, and back. Both
 * bearings are measured, not one derived from the other by adding 180: on a
 * sphere they differ by the convergence of the meridians between the pins
 * (see the note on Aim in shotType.ts).
 */
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'

export interface Measured {
  meters: number
  /** From the first pin to the second, compass degrees. */
  bearing: number
  /** From the second pin back to the first. */
  reverseBearing: number
}

export function measureBetween(from: LatLon, to: LatLon): Measured {
  return {
    meters: distanceMeters(from, to),
    bearing: bearingBetween(from, to),
    reverseBearing: bearingBetween(to, from),
  }
}

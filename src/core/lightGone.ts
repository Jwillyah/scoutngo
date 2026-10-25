/*
 * THE RIDGE GAP, SAID AS WHAT IT COSTS. When the sun drops behind the real
 * skyline (sunCrossings in sunPath.ts) the light is gone, however long the
 * almanac says is left. Clock text comes in from the caller, which owns the
 * venue's time zone.
 */
import { durationWords } from './duration.ts'

export function lightGoneLine(ridge: Date, flat: Date, clock: (at: Date) => string): string {
  const minutes = Math.round((flat.getTime() - ridge.getTime()) / 60_000)
  if (minutes <= 0) return `Light gone ${clock(ridge)} behind the ridge; flat sunset ${clock(flat)}`
  return `Light gone ${clock(ridge)} behind the ridge, ${durationWords(minutes)} before the flat sunset at ${clock(flat)}`
}

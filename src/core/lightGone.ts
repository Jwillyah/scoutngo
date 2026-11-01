/*
 * THE SKYLINE GAP, SAID AS WHAT IT COSTS. When the sun drops behind the real
 * skyline (sunCrossings in sunPath.ts) the light is gone, however long the
 * almanac says is left. Clock text comes in from the caller, which owns the
 * venue's time zone; what blocks it comes in named (src/core/horizonBlocker.ts):
 * "behind the buildings to the WSW", never "the ridge" at a flat beach (1 Nov).
 */
import { durationWords } from './duration.ts'

/** `behind` is what the sun goes behind, in words: "the buildings to the WSW". */
export function lightGoneLine(ridge: Date, flat: Date, clock: (at: Date) => string, behind = 'the ridge'): string {
  const minutes = Math.round((flat.getTime() - ridge.getTime()) / 60_000)
  if (minutes <= 0) return `Light gone ${clock(ridge)} behind ${behind}; flat sunset ${clock(flat)}`
  return `Light gone ${clock(ridge)} behind ${behind}, ${durationWords(minutes)} before the flat sunset at ${clock(flat)}`
}

/** The sunrise over what is there; said once when the skyline makes no difference to the minute. */
export function sunriseLine(skyline: Date, flat: Date, clock: (at: Date) => string, over = 'the ridge'): string {
  if (clock(skyline) === clock(flat)) return `Sunrise ${clock(flat)}`
  return `Sunrise ${clock(skyline)} over ${over}, ${clock(flat)} on a flat horizon`
}

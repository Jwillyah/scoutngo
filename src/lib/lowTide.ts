/*
 * WHICH LOW WATER THE LOW TIDE CHIP SHOWS.
 *
 * THE BUG THIS REPLACES. The chip read the first low among the turns that fall
 * INSIDE the shoot window. A golden-hour window is an hour or so, and a tide
 * turns about every six hours, so most windows contain no low at all and the
 * chip said "no data" -- at Atlantic Park, with NOAA's Virginia Beach station
 * 0.42 km away answering perfectly well. That is an empty state that could not
 * tell "nothing here" from "nothing inside this hour", the blind check again.
 *
 * NOW: the low water nearest the window. Inside it if there is one, otherwise
 * whichever low is closest in time to either end, before or after. The chip
 * is a time, so "13:46" outside an 18:00 window is a true and useful answer:
 * that is when the sandbar is out.
 */

import type { TideExtreme } from '../core/tide.ts'

export function lowTideNearest(
  extremes: readonly TideExtreme[],
  start: Date,
  end: Date,
): TideExtreme | null {
  const lows = extremes.filter((e) => e.kind === 'low')
  if (lows.length === 0) return null
  const s = start.getTime()
  const e = end.getTime()
  /* Distance from the window: zero inside it. */
  const gap = (t: TideExtreme): number => {
    const at = t.at.getTime()
    return at < s ? s - at : at > e ? at - e : 0
  }
  return lows.reduce((best, low) => {
    const d = gap(low)
    const b = gap(best)
    /* Ties go to the earlier one, so the answer is stable. */
    return d < b || (d === b && low.at.getTime() < best.at.getTime()) ? low : best
  })
}

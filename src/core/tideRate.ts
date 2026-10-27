/*
 * HOW FAST THE WATER IS MOVING, IN FEET PER HOUR, TWO WAYS.
 *
 * The Tide sheet says "falling, 0.8 ft an hour". The number is worked out
 * twice, independently, and a test fails if the two disagree past
 * RATE_AGREE_FT_PER_H (the double-math rule for this pass):
 *
 *   fromCurve     the slope of NOAA's six-minute curve across the moment,
 *                 a finite difference over RATE_STEP_MINUTES either side.
 *   fromTurns     the slope of the half cosine between the high and low on
 *                 either side, worked analytically: between turns (t0, h0)
 *                 and (t1, h1) the level is h0 + (h1 - h0)(1 - cos(pi s))/2,
 *                 s = (t - t0)/(t1 - t0), so the slope is
 *                 (h1 - h0) pi sin(pi s) / (2 (t1 - t0)).
 *
 * The real tide is not a perfect half cosine, so the two are not identical;
 * measurements/2026-10-27-tide-checks.md records both, hour by hour.
 */
import { levelAt, type TideExtreme, type TideSample } from './tide.ts'

export const RATE_STEP_MINUTES = 6
/*
 * How far apart the two may be. MEASURED at most 0.07 ft/h across every hour
 * of 27 Oct at Chesapeake Bay Bridge Tunnel, the nearest station publishing a
 * curve (measurements/2026-10-27-tide-checks.md); twice that and a bit.
 */
export const RATE_AGREE_FT_PER_H = 0.15

const HOUR = 3_600_000

/** The curve's slope at `at`, ft/h, or null off the curve's ends. */
export function rateFromCurve(curve: TideSample[], at: Date): number | null {
  const step = RATE_STEP_MINUTES * 60_000
  const a = levelAt(curve, new Date(at.getTime() - step))
  const b = levelAt(curve, new Date(at.getTime() + step))
  if (a === null || b === null) return null
  return (b - a) / ((2 * step) / HOUR)
}

/** The half cosine's slope between the turns either side of `at`, ft/h, or null. */
export function rateFromTurns(extremes: TideExtreme[], at: Date): number | null {
  const sorted = [...extremes].sort((p, q) => p.at.getTime() - q.at.getTime())
  const t = at.getTime()
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]
    const b = sorted[i]
    const t0 = a.at.getTime()
    const t1 = b.at.getTime()
    if (t < t0 || t > t1 || t1 === t0) continue
    const s = (t - t0) / (t1 - t0)
    return ((b.feet - a.feet) * Math.PI * Math.sin(Math.PI * s)) / (2 * ((t1 - t0) / HOUR))
  }
  return null
}

/** The rate to show: the published curve's when NOAA published one, else the turns'. */
export function tideRate(curve: TideSample[], extremes: TideExtreme[], at: Date, published: boolean): number | null {
  return (published ? rateFromCurve(curve, at) : null) ?? rateFromTurns(extremes, at)
}

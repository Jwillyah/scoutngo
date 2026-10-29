/*
 * SUNRISE ON A DAY AT A PLACE, ON THE SAME CALIBRATED HORIZON THE TIME BAR
 * DRAWS (sunPath.ts BAND_THRESHOLDS.horizon), so the glass-morning strip and
 * the gold on the bar agree to the minute.
 *
 * Found by stepping a minute at a time from the venue's local midnight to the
 * first minute the sun is above the horizon. The second way, held by a test,
 * is suncalc's own getTimes().sunrise, an analytic solution; the two differ by
 * the calibration (a few minutes), never more than SUNRISE_AGREE_MIN.
 */
import { getPosition } from 'suncalc'
import { BAND_THRESHOLDS } from './sunPath.ts'
import { zonedTimeToUtc } from './timezone.ts'

export const SUNRISE_AGREE_MIN = 6

/**
 * The first sunrise after `at` at a place: today's if it is still to come,
 * else tomorrow's (and the day after, past a polar night's edge). Null when
 * there is none within three days.
 */
export function nextSunrise(at: Date, lat: number, lon: number, timeZone: string): Date | null {
  for (let day = 0; day < 3; day += 1) {
    const t = new Date(at.getTime() + day * 86_400_000)
    const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t)
    const rise = sunriseOn(date, lat, lon, timeZone)
    if (rise !== null && rise.getTime() > at.getTime()) return rise
  }
  return null
}

export function sunriseOn(date: string, lat: number, lon: number, timeZone: string): Date | null {
  const midnight = zonedTimeToUtc(date, '00:00', timeZone)
  if (midnight === null) return null
  const above = (t: number) => getPosition(new Date(t), lat, lon).altitude > BAND_THRESHOLDS.horizon
  let was = above(midnight.getTime())
  for (let m = 1; m <= 24 * 60; m += 1) {
    const t = midnight.getTime() + m * 60_000
    const now = above(t)
    if (now && !was) return new Date(t)
    was = now
  }
  return null
}

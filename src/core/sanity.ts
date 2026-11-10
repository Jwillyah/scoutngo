/*
 * SANITY, IN CODE (Batch QA, Section 4). A number outside what can be true is
 * never shown: it becomes null, which every screen says as "—", and the
 * next refresh asks again. Each rule is a fact about the world, not a taste:
 *
 *   wind      never negative
 *   gust      never under the wind it gusts over
 *   surf      a range's low never over its high
 *   period    2 to 25 s (shorter is not swell; longer is not on this coast)
 *   tide      inside the station's own predicted range for the window
 *   sunset    4 to 9 PM at the spot (the lower 48, every day of the year)
 *   azimuth   0 to 360°, wrapped, never NaN
 */
export const PERIOD_MIN_S = 2
export const PERIOD_MAX_S = 25
export const SUNSET_EARLIEST_H = 16
export const SUNSET_LATEST_H = 21

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export const saneWind = (mps: number | null | undefined): number | null => (finite(mps) && mps >= 0 ? mps : null)

export const saneGust = (gustMps: number | null | undefined, windMps: number | null | undefined): number | null => {
  if (!finite(gustMps) || gustMps < 0) return null
  return finite(windMps) && gustMps < windMps ? null : gustMps
}

export const saneRange = (lowFt: number | null | undefined, highFt: number | null | undefined): { lowFt: number; highFt: number } | null =>
  finite(lowFt) && finite(highFt) && lowFt >= 0 && lowFt <= highFt ? { lowFt, highFt } : null

export const sanePeriod = (s: number | null | undefined): number | null => (finite(s) && s >= PERIOD_MIN_S && s <= PERIOD_MAX_S ? s : null)

/** A tide level inside the station's predicted low and high for the window, with a little slack for rounding. */
export const saneTide = (ft: number | null | undefined, lowFt: number, highFt: number, slackFt = 0.25): number | null =>
  finite(ft) && ft >= lowFt - slackFt && ft <= highFt + slackFt ? ft : null

/** A sunset whose local hour (0-24, minutes as a fraction) is between 4 and 9 PM. */
export const saneSunsetHour = (localHour: number | null | undefined): boolean => finite(localHour) && localHour >= SUNSET_EARLIEST_H && localHour <= SUNSET_LATEST_H

export const saneAzimuth = (deg: number | null | undefined): number | null => (finite(deg) ? ((deg % 360) + 360) % 360 : null)

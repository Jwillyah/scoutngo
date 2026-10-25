/*
 * THE LIGHT AT THE MOMENT ON THE TIME BAR, AND WHEN IT CHANGES.
 *
 * Which band the sun is in (sunPath.ts band(), the same edges the time bar
 * paints), how high and which way, the next band boundary found by stepping
 * forward a minute at a time, and the shadow a standing person throws. All
 * arithmetic; nothing about cloud, which is the cloud card's to say.
 */
import { getPosition } from 'suncalc'
import { band, type SunBand } from './sunPath.ts'
import { subjectShadow } from './shadowMap.ts'
import { normalizeBearing } from './sun.ts'

/** A standing adult, for the shadow line. Said wherever the number is shown. */
export const PERSON_HEIGHT_METERS = 1.8
/** How far ahead to look for the next change. A polar day may have none. */
const LOOK_AHEAD_MINUTES = 18 * 60

export const BAND_WORDS: Record<SunBand, string> = {
  day: 'Daylight',
  golden: 'Golden hour',
  blue: 'Blue hour',
  nautical: 'Nautical twilight',
  astronomical: 'Astronomical twilight',
  night: 'Night',
}

export interface LightNow {
  band: SunBand
  altitude: number
  azimuth: number
  /** The next band, and in how many minutes. Null when nothing changes within LOOK_AHEAD_MINUTES. */
  next: { band: SunBand; minutes: number } | null
  /** A standing person's shadow. Null with the sun down. */
  personShadow: { lengthMeters: number; bearing: number; capped: boolean } | null
}

export function lightNow(at: Date, lat: number, lon: number): LightNow {
  const p = getPosition(at, lat, lon)
  const here = band(p.altitude)
  let next: LightNow['next'] = null
  for (let m = 1; m <= LOOK_AHEAD_MINUTES; m += 1) {
    const b = band(getPosition(new Date(at.getTime() + m * 60_000), lat, lon).altitude)
    if (b !== here) {
      next = { band: b, minutes: m }
      break
    }
  }
  const shadow = subjectShadow(PERSON_HEIGHT_METERS, 0.5, { azimuth: normalizeBearing(p.azimuth), altitude: p.altitude })
  return {
    band: here,
    altitude: p.altitude,
    azimuth: normalizeBearing(p.azimuth),
    next,
    personShadow: shadow === null ? null : { lengthMeters: shadow.lengthMeters, bearing: shadow.bearing, capped: shadow.capped },
  }
}

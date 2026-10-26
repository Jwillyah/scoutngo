/*
 * MOONRISE AND MOONSET, AND WHERE ON THE HORIZON, for the map's moon rays.
 *
 * The moon's version of getSunArc in sun.ts: suncalc gives the times, and the
 * bearing is the moon's own azimuth at each. A day can have no moonrise or no
 * moonset -- the moon's day is about fifty minutes longer than ours -- and
 * that is null, said, never a borrowed time from the day before.
 */
import { getMoonPosition } from 'suncalc'
import { moonTimesOnLocalDay } from './moonTimes.ts'
import type { SunEvent } from './sun.ts'
import { normalizeBearing } from './sun.ts'

export interface MoonArc {
  rise: SunEvent | null
  set: SunEvent | null
  /** Where the moon is at the instant asked, and how high. */
  azimuth: number
  altitude: number
}

const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

export function getMoonArc(at: Date, lat: number, lon: number): MoonArc {
  /* The venue's own day, not suncalc's UTC one: see moonTimes.ts. */
  const times = moonTimesOnLocalDay(at, lat, lon)
  const event = (when: unknown): SunEvent | null =>
    usable(when) ? { at: when, azimuth: normalizeBearing(getMoonPosition(when, lat, lon).azimuth) } : null
  const now = getMoonPosition(at, lat, lon)
  return { rise: event(times.rise), set: event(times.set), azimuth: normalizeBearing(now.azimuth), altitude: now.altitude }
}

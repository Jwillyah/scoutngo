/*
 * TERRAIN LIGHT: what the light does where the land is not flat, for Land ›
 * Terrain light (inland, field test 30 Oct). Arithmetic only; the horizon is
 * the terrain's own (src/core/skyWindow.ts HorizonInput), the sun suncalc's.
 *
 *  - When the sun clears the skyline in the morning and drops behind it in
 *    the evening, minute by minute, against the measured horizon along the
 *    sun's own bearing. Beside the flat-horizon times, so the difference is
 *    the ridge's.
 *  - The alpenglow window: the minutes the sun is between 0° and 4° below
 *    the level horizon, when it still lights high ground across the valley
 *    with nothing direct on the ground at the venue. The ±4° band is the
 *    method, said in the page's "i"; it is not a promise of colour.
 *
 * Every altitude here is suncalc's, which already includes refraction; the
 * skyline angle is geometric from the elevation tiles. The difference is
 * about half a degree at the horizon, so the times are said to the minute
 * and no closer.
 */
import { getTimes } from 'suncalc'
import { horizonAngleAt, type HorizonInput } from './skyWindow.ts'
import { getSunPosition } from './sun.ts'

export const ALPENGLOW_BELOW_DEG = 4
const MINUTE = 60_000

/* Degrees, compass azimuth: the one sun position the rest of the app uses (src/core/sun.ts). */
const sunAt = (t: Date, lat: number, lon: number) => getSunPosition(t, lat, lon)

const clearOf = (t: Date, lat: number, lon: number, horizon: HorizonInput): boolean => {
  const s = sunAt(t, lat, lon)
  return s.altitude > horizonAngleAt(horizon, s.azimuth)
}

export interface SkylineSun {
  /** Flat-horizon sunrise and sunset (suncalc's), null where the sun does not rise or set. */
  flatRise: Date | null
  flatSet: Date | null
  /** First minute the sun stands above the skyline, and the last. Null when it never clears it that day. */
  ridgeRise: Date | null
  ridgeSet: Date | null
}

/** The day's sun against the skyline, `day` any instant on the venue's date (noon is safest). */
export function skylineSun(day: Date, lat: number, lon: number, horizon: HorizonInput): SkylineSun {
  const t = getTimes(day, lat, lon)
  const ok = (d: Date | null | undefined) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null)
  const flatRise = ok(t.sunrise)
  const flatSet = ok(t.sunset)
  if (flatRise === null || flatSet === null) return { flatRise, flatSet, ridgeRise: null, ridgeSet: null }
  let ridgeRise: Date | null = null
  for (let m = flatRise.getTime() - 10 * MINUTE; m < flatSet.getTime(); m += MINUTE) {
    if (clearOf(new Date(m), lat, lon, horizon)) {
      ridgeRise = new Date(m)
      break
    }
  }
  let ridgeSet: Date | null = null
  if (ridgeRise !== null) {
    for (let m = flatSet.getTime() + 10 * MINUTE; m > ridgeRise.getTime(); m -= MINUTE) {
      if (clearOf(new Date(m), lat, lon, horizon)) {
        ridgeSet = new Date(m)
        break
      }
    }
  }
  return { flatRise, flatSet, ridgeRise, ridgeSet }
}

export interface Span {
  from: Date
  to: Date
}

/** The evening and morning alpenglow windows around `day`: the sun 0° to ALPENGLOW_BELOW_DEG° below the level horizon. */
export function alpenglow(day: Date, lat: number, lon: number): { morning: Span | null; evening: Span | null } {
  const t = getTimes(day, lat, lon)
  const set = t.sunset instanceof Date && !Number.isNaN(t.sunset.getTime()) ? t.sunset : null
  const rise = t.sunrise instanceof Date && !Number.isNaN(t.sunrise.getTime()) ? t.sunrise : null
  const inBand = (m: number) => {
    const a = sunAt(new Date(m), lat, lon).altitude
    return a <= 0 && a >= -ALPENGLOW_BELOW_DEG
  }
  const walk = (from: number, step: number): Span | null => {
    let first: number | null = null
    let last: number | null = null
    for (let i = 0, m = from; i < 120; i += 1, m += step) {
      if (inBand(m)) {
        first ??= m
        last = m
      } else if (first !== null) break
    }
    if (first === null || last === null) return null
    return step > 0 ? { from: new Date(first), to: new Date(last) } : { from: new Date(last), to: new Date(first) }
  }
  return { evening: set === null ? null : walk(set.getTime() - 5 * MINUTE, MINUTE), morning: rise === null ? null : walk(rise.getTime() + 5 * MINUTE, -MINUTE) }
}

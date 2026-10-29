/*
 * THE MONTH, DAY BY DAY: WHAT IS GOOD ON EACH DAY AT THIS PLACE.
 *
 * Sky › Calendar (src/components/CalendarPage.tsx) draws this; nothing here
 * is drawn. Every mark is computed for the venue:
 *
 *   moon        its phase at local noon, as a lit fraction and a phase
 *               angle; new and full named on the day they fall
 *   supermoon   a full moon closer than SUPERMOON_KM
 *   glass       sunrise or sunset with light or offshore wind and little low
 *               cloud (forecast days only)
 *   colour      a colourful sky at sunrise or sunset: mid or high cloud to
 *               catch the light, little low cloud (forecast days only;
 *               src/core/colorChance.ts)
 *   tide        a low tide within LOW_NEAR_SUNRISE_MIN of sunrise or sunset
 *   surf        Fun or bigger at sunrise, where there is a beach
 *   milky       one of the best Milky Way nights of the next thirty
 *   meteor      a meteor shower's peak night
 *   moon by sun the moon rising within MOON_NEAR_SUN_MIN of sunset, or
 *               setting within it of sunrise
 *
 * A day past the end of the weather forecast carries only the marks that need
 * no forecast (moon, tide, Milky Way, meteors) and says so (`forecast`); a
 * mark that needs one is never guessed for it.
 */
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc'
import { colorChance } from './colorChance.ts'
import { LOW_CLOUD_BROKEN } from './cloud.ts'
import { isGlassy, windToBeach } from './coastFacing.ts'
import { LOW_NEAR_SUNRISE_MIN } from './glassMornings.ts'
import { moonTimesOnLocalDay } from './moonTimes.ts'
import { showerEventsBetween } from './skyEvents.ts'
import { BAND_THRESHOLDS } from './sunPath.ts'
import { sunriseOn } from './sunrise.ts'
import { surfSize } from './surf.ts'
import { zonedTimeToUtc } from './timezone.ts'

export const MOON_NEAR_SUN_MIN = 45
/* A full moon nearer than this is called a supermoon: about 90% of the way to perigee. */
export const SUPERMOON_KM = 361_000

export type DayMark =
  | 'glass-rise'
  | 'glass-set'
  | 'colour-rise'
  | 'colour-set'
  | 'tide-rise'
  | 'tide-set'
  | 'surf'
  | 'milky'
  | 'meteor'
  | 'supermoon'
  | 'moon-by-sun'

export interface CalendarDay {
  /** yyyy-mm-dd at the venue. */
  date: string
  /** In the month asked for, or a day of the weeks either side that fill the grid. */
  inMonth: boolean
  today: boolean
  /** Within the weather forecast: glass, colour and surf are only ever said for these. */
  forecast: boolean
  /** Before today: no forecast is coming, so it is not said to be waiting for one. */
  past: boolean
  sunrise: Date | null
  sunset: Date | null
  moon: {
    /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter (suncalc's phase). */
    phase: number
    /** Lit fraction, 0 to 1. */
    lit: number
    /** Named only on the day it falls. */
    named: 'new' | 'full' | null
  }
  marks: DayMark[]
  /** For the day card, in words: "low tide 7:51", "offshore 4 kt". Times as Dates, worded by the caller. */
  facts: {
    lowNearSunrise: Date | null
    lowNearSunset: Date | null
    windAtSunrise: { speedMps: number; relation: 'onshore' | 'offshore' | 'cross' | null } | null
    surfFt: number | null
    moonrise: Date | null
    moonset: Date | null
    meteor: string | null
  }
}

export interface CalendarInput {
  year: number
  /** 1 to 12. */
  month: number
  lat: number
  lon: number
  timeZone: string
  /** yyyy-mm-dd, at the venue. */
  today: string
  /** The last date the weather forecast covers, or null with no forecast at all. */
  forecastUntil: string | null
  /** Tide turns, or null where there is no tide station. */
  extremes: readonly { at: Date; kind: 'high' | 'low' }[] | null
  windAt: (at: Date) => { speedMps: number; fromDeg: number } | null
  skyAt: (at: Date) => { low: number | null; mid: number | null; high: number | null } | null
  /** Which way the beach faces, or null where there is none. */
  facing: number | null
  surfFtAt: (at: Date) => number | null
  /** The dates of the best Milky Way nights. */
  milkyDates: ReadonlySet<string>
}

const pad = (n: number) => String(n).padStart(2, '0')
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

/** Sunset on a day at a place: the last minute the sun is above the same calibrated horizon as sunrise. */
export function sunsetOn(date: string, lat: number, lon: number, timeZone: string): Date | null {
  const noon = zonedTimeToUtc(date, '12:00', timeZone)
  if (noon === null) return null
  const above = (t: number) => getPosition(new Date(t), lat, lon).altitude > BAND_THRESHOLDS.horizon
  let was = above(noon.getTime())
  for (let m = 1; m <= 12 * 60; m += 1) {
    const t = noon.getTime() + m * 60_000
    const now = above(t)
    if (was && !now) return new Date(t)
    was = now
  }
  return null
}

/**
 * Whether the phase passes `target` (0 new, 0.5 full) between two instants a
 * day or less apart. suncalc's phase wobbles back by a hair from hour to
 * hour, so "it went down" is not "it wrapped past new": a wrap is a drop of
 * more than half the cycle (the two-way test counted 57 "new moons" in 2026
 * before this).
 */
function passes(a: number, b: number, target: number): boolean {
  if (target === 0) return b < a - 0.5
  return a < target && b >= target && b - a < 0.25
}

/** The month as weeks Sunday to Saturday, each day with its marks. */
export function calendarMonth(input: CalendarInput): CalendarDay[] {
  const first = `${input.year}-${pad(input.month)}-01`
  const start = addDays(first, -weekday(first))
  const lastOfMonth = addDays(`${input.month === 12 ? input.year + 1 : input.year}-${pad(input.month === 12 ? 1 : input.month + 1)}-01`, -1)
  const end = addDays(lastOfMonth, 6 - weekday(lastOfMonth))
  const tz = input.timeZone
  const from = zonedTimeToUtc(start, '00:00', tz) ?? new Date(`${start}T00:00:00Z`)
  const to = zonedTimeToUtc(addDays(end, 1), '00:00', tz) ?? new Date(`${end}T23:59:59Z`)
  const showers = showerEventsBetween(new Date(from.getTime() - 86_400_000), new Date(to.getTime() + 86_400_000))
  const lows = (input.extremes ?? []).filter((e) => e.kind === 'low').map((e) => e.at)
  const nearest = (t: Date | null) => {
    if (t === null) return null
    let best: Date | null = null
    for (const l of lows) if (Math.abs(l.getTime() - t.getTime()) <= LOW_NEAR_SUNRISE_MIN * 60_000 && (best === null || Math.abs(l.getTime() - t.getTime()) < Math.abs(best.getTime() - t.getTime()))) best = l
    return best
  }

  const days: CalendarDay[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const midnight = zonedTimeToUtc(date, '00:00', tz)
    const nextMidnight = zonedTimeToUtc(addDays(date, 1), '00:00', tz)
    const noon = zonedTimeToUtc(date, '12:00', tz) ?? new Date(`${date}T12:00:00Z`)
    const illum = getMoonIllumination(noon)
    let named: 'new' | 'full' | null = null
    if (midnight !== null && nextMidnight !== null) {
      const a = getMoonIllumination(midnight).phase
      const b = getMoonIllumination(nextMidnight).phase
      if (passes(a, b, 0)) named = 'new'
      else if (passes(a, b, 0.5)) named = 'full'
    }
    const sunrise = sunriseOn(date, input.lat, input.lon, tz)
    const sunset = sunsetOn(date, input.lat, input.lon, tz)
    const forecast = input.forecastUntil !== null && date >= input.today && date <= input.forecastUntil
    const marks: DayMark[] = []

    const windRise = forecast && sunrise !== null ? input.windAt(sunrise) : null
    const glassAt = (t: Date | null) => {
      if (!forecast || t === null) return false
      const w = input.windAt(t)
      const sky = input.skyAt(t)
      if (w === null || sky === null || sky.low === null) return false
      return isGlassy(w.speedMps, input.facing === null ? null : windToBeach(w.fromDeg, input.facing)) && sky.low < LOW_CLOUD_BROKEN
    }
    const colourAt = (t: Date | null) => {
      if (!forecast || t === null) return false
      const sky = input.skyAt(t)
      return sky !== null && colorChance(sky).chance === 'good'
    }
    if (glassAt(sunrise)) marks.push('glass-rise')
    if (glassAt(sunset)) marks.push('glass-set')
    if (colourAt(sunrise)) marks.push('colour-rise')
    if (colourAt(sunset)) marks.push('colour-set')
    const lowNearSunrise = nearest(sunrise)
    const lowNearSunset = nearest(sunset)
    if (lowNearSunrise !== null) marks.push('tide-rise')
    if (lowNearSunset !== null) marks.push('tide-set')
    const surfFt = forecast && sunrise !== null && input.facing !== null ? input.surfFtAt(sunrise) : null
    if (surfFt !== null && ['Fun', 'Solid', 'Big'].includes(surfSize(surfFt))) marks.push('surf')
    if (input.milkyDates.has(date)) marks.push('milky')
    const shower = showers.find((s) => {
      const e = s.eveningOf
      const d = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`
      return d === date && s.note.startsWith('the listed peak')
    })
    if (shower !== undefined) marks.push('meteor')
    if (named === 'full' && getMoonPosition(noon, input.lat, input.lon).distance < SUPERMOON_KM) marks.push('supermoon')
    const mt = moonTimesOnLocalDay(noon, input.lat, input.lon, tz)
    const near = (a: Date | null, b: Date | null) => a !== null && b !== null && Math.abs(a.getTime() - b.getTime()) <= MOON_NEAR_SUN_MIN * 60_000
    if (near(mt.rise, sunset) || near(mt.set, sunrise)) marks.push('moon-by-sun')

    days.push({
      date,
      inMonth: date.slice(0, 7) === first.slice(0, 7),
      today: date === input.today,
      forecast,
      past: date < input.today,
      sunrise,
      sunset,
      moon: { phase: illum.phase, lit: illum.fraction, named },
      marks,
      facts: {
        lowNearSunrise,
        lowNearSunset,
        windAtSunrise: windRise === null ? null : { speedMps: windRise.speedMps, relation: input.facing === null ? null : windToBeach(windRise.fromDeg, input.facing) },
        surfFt,
        moonrise: mt.rise,
        moonset: mt.set,
        meteor: shower?.name ?? null,
      },
    })
  }
  return days
}

/** Which marks each filter chip keeps. */
export const FILTERS = {
  Sunrise: ['glass-rise', 'colour-rise', 'tide-rise', 'moon-by-sun'],
  Sunset: ['glass-set', 'colour-set', 'tide-set', 'moon-by-sun'],
  Tide: ['tide-rise', 'tide-set'],
  Surf: ['surf'],
  Night: ['milky', 'meteor', 'supermoon', 'moon-by-sun'],
} as const satisfies Record<string, readonly DayMark[]>
export type CalendarFilter = keyof typeof FILTERS

/**
 * The time to plan a day at: its sunrise when the morning has something, its
 * sunset when the evening does, the night (an hour after sunset) for a night
 * mark, and sunrise otherwise.
 */
export function bestTime(day: CalendarDay): Date | null {
  const has = (...m: DayMark[]) => m.some((x) => day.marks.includes(x))
  if (has('glass-rise', 'colour-rise', 'tide-rise', 'surf') && day.sunrise !== null) return day.sunrise
  if (has('glass-set', 'colour-set', 'tide-set') && day.sunset !== null) return day.sunset
  if (has('milky', 'meteor', 'supermoon') && day.sunset !== null) return new Date(day.sunset.getTime() + 3_600_000)
  return day.sunrise ?? day.sunset
}

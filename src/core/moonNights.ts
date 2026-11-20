/*
 * SKY › NIGHT (Batch SIMPLE-2, Section 4; mockup Sky_Night): every number the
 * Night tab shows, worked out here. The page only draws.
 *
 * ONE SOURCE FOR EACH FACT, and none of them new except the phase instant:
 *
 *   rise, set, bearing     the venue's own day, src/core/moonTimes.ts, through
 *                          sunMoonNight's moonTonight and moonFortnight
 *   share lit              suncalc's getMoonIllumination, as everywhere else
 *   full / new instant     src/core/moonPhases.ts (Meeus 49): suncalc's phase
 *                          is up to two hours out, measured in
 *                          measurements/2026-11-19-moon-fixture.md
 *   waxing or waning       from that instant: the next phase coming is full
 *   sunrise, sunset        suncalc getTimes at local noon, as moonrisePlan
 *   Milky Way              the planner's milkyWayNight (src/core/milkyWay.ts)
 *   next shower            sunMoonNight's nextShower over the IMO table in
 *                          src/core/celestial.ts
 *
 * HELD TO A SECOND EPHEMERIS. tests/moonFixture.test.ts holds the rise, set,
 * bearing and phase times at Chic's Beach to USNO's saved answers
 * (tests/data/usno-moon-2026-11-19/) within 5 minutes and 2°.
 *
 * Never "clear", never "safe": whether cloud hides the moon is the Sky
 * page's call, not this file's.
 */
import { getMoonIllumination, getMoonPosition, getTimes } from 'suncalc'
import { compassPoint } from './field.ts'
import { milkyWayNight, type MilkyWayNight } from './milkyWay.ts'
import { moonPhasesBetween, type MoonPhaseInstant } from './moonPhases.ts'
import { localDate, moonTimesOnLocalDay } from './moonTimes.ts'
import { normalizeBearing } from './sun.ts'
import { moonFortnight, moonTonight, nextShower, type ShowerNext } from './sunMoonNight.ts'
import { zonedTimeToUtc } from './timezone.ts'

const MIN = 60_000
const DAY = 86_400_000
const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** Big moonrise: a night within this many days of the full moon's date … */
export const BIG_MOONRISE_DAYS = 1
/** … with the moon rising within this many minutes of sunset, either side. */
export const BIG_MOONRISE_MINUTES = 45
/** Moonset at sunrise: the moon at least this share lit … */
export const MOONSET_MIN_LIT = 0.95
/** … setting within this many minutes of sunrise, either side. */
export const MOONSET_SUNRISE_MINUTES = 30
/** Darkest nights: the new moon's date and this many nights either side. */
export const DARK_NIGHTS_EITHER_SIDE = 3
/** How far ahead the Milky Way row looks for the core's return. */
export const MILKY_WAY_LOOKAHEAD_NIGHTS = 150

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const moonAz = (at: Date, lat: number, lon: number) => normalizeBearing(getMoonPosition(at, lat, lon).azimuth)

export interface Bearing {
  at: Date
  /** Degrees from true north. */
  azimuth: number
  /** "WNW", the 16-point abbreviation (field.ts compassPoint). */
  compass: string
}

const bearing = (at: Date, lat: number, lon: number): Bearing => {
  const azimuth = moonAz(at, lat, lon)
  return { at, azimuth, compass: compassPoint(azimuth) }
}

/** The phases from a little before an instant to well after, the one list everything here reads. */
function phasesAround(now: Date, days: number): MoonPhaseInstant[] {
  return moonPhasesBetween(new Date(now.getTime() - 16 * DAY), new Date(now.getTime() + (days + 32) * DAY))
}

/** Waxing when the next phase still to come is the full one. */
function waxingAt(at: Date, phases: MoonPhaseInstant[]): boolean {
  const next = phases.find((p) => p.at.getTime() > at.getTime())
  return next?.kind === 'full'
}

/**
 * Tonight's calendar date: the local date, except before this morning's
 * sunrise, when the night still running began yesterday.
 */
export function tonightDate(now: Date, lat: number, lon: number, timeZone: string): string {
  const today = localDate(now, timeZone)
  const noon = zonedTimeToUtc(today, '12:00', timeZone)
  const sunrise = noon === null ? null : getTimes(noon, lat, lon).sunrise
  return usable(sunrise) && now.getTime() < sunrise.getTime() ? shiftDate(today, -1) : today
}

/* ------------------------------------------------------- tonight's moon */

export interface TonightMoon {
  /** 0..1, now if the moon is up, else at its next rise. */
  lit: number
  waxing: boolean
  up: boolean
  /** The rise already past (up) or the next one. */
  rise: Bearing | null
  /** The set after that rise. */
  set: Bearing | null
}

export function tonightMoon(now: Date, lat: number, lon: number, timeZone: string): TonightMoon {
  const m = moonTonight(now, lat, lon, timeZone)
  const phases = phasesAround(now, 0)
  return {
    lit: m.lit,
    waxing: waxingAt(m.up ? now : (m.rise?.at ?? now), phases),
    up: m.up,
    rise: m.rise === null ? null : bearing(m.rise.at, lat, lon),
    set: m.set === null ? null : bearing(m.set.at, lat, lon),
  }
}

/* ---------------------------------------------------------- the strip */

export interface StripNight {
  /** yyyy-mm-dd, the venue's calendar. */
  date: string
  /** 0..1 at 9 PM local (sunMoonNight's moonFortnight). */
  lit: number
  waxing: boolean
  /** The full or new moon's instant falls on this local date. */
  mark: 'full' | 'new' | null
}

/** Fourteen nights from tonight, the full and new moon's dates marked. */
export function phaseStrip(now: Date, lat: number, lon: number, timeZone: string, nights = 14): StripNight[] {
  const first = tonightDate(now, lat, lon, timeZone)
  const start = zonedTimeToUtc(first, '12:00', timeZone) ?? now
  const phases = phasesAround(start, nights)
  const marks = new Map(phases.map((p) => [localDate(p.at, timeZone), p.kind] as const))
  return moonFortnight(start, timeZone, nights).map((d) => ({
    date: d.date,
    lit: d.lit,
    waxing: waxingAt(d.at, phases),
    mark: marks.get(d.date) ?? null,
  }))
}

/* -------------------------------------------------------------- moments */

export interface BigMoonriseMoment {
  kind: 'big-moonrise'
  date: string
  moonrise: Bearing
  sunset: Date
  /** Positive: the moon rises this many minutes before sunset; negative, after. */
  minutesBeforeSunset: number
  lit: number
  fullMoon: Date
}

export interface MoonsetAtSunriseMoment {
  kind: 'moonset-at-sunrise'
  date: string
  moonset: Bearing
  sunrise: Date
  /** Positive: the moon sets this many minutes after sunrise; negative, before. */
  minutesAfterSunrise: number
  lit: number
}

export type MoonMoment = BigMoonriseMoment | MoonsetAtSunriseMoment

const momentAt = (m: MoonMoment) => (m.kind === 'big-moonrise' ? m.moonrise.at : m.moonset.at)

/**
 * The moments in the next `days` days still to come, soonest first:
 *
 *   Big moonrise        a night within BIG_MOONRISE_DAYS of the full moon's
 *                       date, the moon rising within BIG_MOONRISE_MINUTES of
 *                       that day's sunset
 *   Moonset at sunrise  the moon at least MOONSET_MIN_LIT lit at its set,
 *                       setting within MOONSET_SUNRISE_MINUTES of that day's
 *                       sunrise
 */
export function moonMoments(now: Date, lat: number, lon: number, timeZone: string, days = 30): MoonMoment[] {
  const today = localDate(now, timeZone)
  const last = shiftDate(today, days)
  const out: MoonMoment[] = []
  const day = (date: string) => {
    const noon = zonedTimeToUtc(date, '12:00', timeZone)
    if (noon === null) return null
    const sun = getTimes(noon, lat, lon)
    return { moon: moonTimesOnLocalDay(noon, lat, lon, timeZone), sunrise: usable(sun.sunrise) ? sun.sunrise : null, sunset: usable(sun.sunset) ? sun.sunset : null }
  }
  const ahead = (at: Date) => at.getTime() > now.getTime()

  for (const full of phasesAround(now, days).filter((p) => p.kind === 'full')) {
    const centre = localDate(full.at, timeZone)
    for (let off = -BIG_MOONRISE_DAYS; off <= BIG_MOONRISE_DAYS; off += 1) {
      const date = shiftDate(centre, off)
      if (date < today || date > last) continue
      const d = day(date)
      if (d === null || d.moon.rise === null || d.sunset === null || !ahead(d.moon.rise)) continue
      const lead = Math.round((d.sunset.getTime() - d.moon.rise.getTime()) / MIN)
      if (Math.abs(lead) > BIG_MOONRISE_MINUTES) continue
      out.push({ kind: 'big-moonrise', date, moonrise: bearing(d.moon.rise, lat, lon), sunset: d.sunset, minutesBeforeSunset: lead, lit: getMoonIllumination(d.moon.rise).fraction, fullMoon: full.at })
    }
  }

  for (let date = today; date <= last; date = shiftDate(date, 1)) {
    const d = day(date)
    if (d === null || d.moon.set === null || d.sunrise === null || !ahead(d.moon.set)) continue
    const after = Math.round((d.moon.set.getTime() - d.sunrise.getTime()) / MIN)
    const lit = getMoonIllumination(d.moon.set).fraction
    if (Math.abs(after) > MOONSET_SUNRISE_MINUTES || lit < MOONSET_MIN_LIT) continue
    out.push({ kind: 'moonset-at-sunrise', date, moonset: bearing(d.moon.set, lat, lon), sunrise: d.sunrise, minutesAfterSunrise: after, lit })
  }

  return out.sort((a, b) => momentAt(a).getTime() - momentAt(b).getTime())
}

/* ----------------------------------------------------------------- rows */

export interface PhaseRow {
  at: Date
  /** yyyy-mm-dd on the venue's calendar. */
  date: string
}

export interface DarkNights {
  /** yyyy-mm-dd, the new moon's date less DARK_NIGHTS_EITHER_SIDE, or tonight if that has passed. */
  from: string
  to: string
  newMoon: Date
}

export interface MilkyWayRow {
  /** Tonight, the planner's own night (window null: not tonight, and why in `reason`). */
  tonight: MilkyWayNight
  /**
   * The first night from tonight with a window, within
   * MILKY_WAY_LOOKAHEAD_NIGHTS; null when there is none that soon.
   */
  next: MilkyWayNight | null
}

export interface NightRows {
  nextFull: PhaseRow
  nextNew: PhaseRow
  darkest: DarkNights
  milkyWay: MilkyWayRow
  /** Null when the IMO table has nothing ahead (it always has, a year round). */
  shower: ShowerNext | null
}

const firstAfter = (now: Date, phases: MoonPhaseInstant[], kind: MoonPhaseInstant['kind']) =>
  phases.find((p) => p.kind === kind && p.at.getTime() > now.getTime())!

/** The next full and new moon, to the minute, on the venue's calendar. */
export function nextPhases(now: Date, timeZone: string): { full: PhaseRow; new: PhaseRow } {
  const phases = phasesAround(now, 0)
  const row = (p: MoonPhaseInstant): PhaseRow => ({ at: p.at, date: localDate(p.at, timeZone) })
  return { full: row(firstAfter(now, phases, 'full')), new: row(firstAfter(now, phases, 'new')) }
}

/** The new moon's date ± DARK_NIGHTS_EITHER_SIDE: the run still running tonight, or the next. */
export function darkNights(now: Date, lat: number, lon: number, timeZone: string): DarkNights {
  const tonight = tonightDate(now, lat, lon, timeZone)
  const run = phasesAround(now, 0)
    .filter((p) => p.kind === 'new')
    .map((p) => {
      const centre = localDate(p.at, timeZone)
      return { from: shiftDate(centre, -DARK_NIGHTS_EITHER_SIDE), to: shiftDate(centre, DARK_NIGHTS_EITHER_SIDE), newMoon: p.at }
    })
    .find((r) => r.to >= tonight)!
  return { ...run, from: run.from < tonight ? tonight : run.from }
}

/** Tonight's Milky Way, and the first night ahead the core is up in the dark with the moon out of the way. */
export function milkyWayRow(now: Date, lat: number, lon: number, timeZone: string): MilkyWayRow {
  let date = tonightDate(now, lat, lon, timeZone)
  const tonight = milkyWayNight(date, lat, lon, timeZone)
  if (tonight.window !== null) return { tonight, next: tonight }
  for (let i = 1; i < MILKY_WAY_LOOKAHEAD_NIGHTS; i += 1) {
    date = shiftDate(date, 1)
    const n = milkyWayNight(date, lat, lon, timeZone)
    if (n.window !== null) return { tonight, next: n }
  }
  return { tonight, next: null }
}

export function nightRows(now: Date, lat: number, lon: number, timeZone: string): NightRows {
  const { full, new: nu } = nextPhases(now, timeZone)
  return {
    nextFull: full,
    nextNew: nu,
    darkest: darkNights(now, lat, lon, timeZone),
    milkyWay: milkyWayRow(now, lat, lon, timeZone),
    shower: nextShower(now, timeZone),
  }
}

/* ------------------------------------------------------------- the tab */

export interface MoonNightTab {
  tonight: TonightMoon
  strip: StripNight[]
  moments: MoonMoment[]
  rows: NightRows
}

/** Everything the Night tab shows, in one call. */
export function moonNightTab(now: Date, lat: number, lon: number, timeZone: string): MoonNightTab {
  return {
    tonight: tonightMoon(now, lat, lon, timeZone),
    strip: phaseStrip(now, lat, lon, timeZone),
    moments: moonMoments(now, lat, lon, timeZone),
    rows: nightRows(now, lat, lon, timeZone),
  }
}

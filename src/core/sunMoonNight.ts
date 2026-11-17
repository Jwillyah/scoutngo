/*
 * SUN · MOON · NIGHT (Batch DRONE, Section 4; boards SkySun, SkyMoon, SkyB2n).
 * Every time, bearing, height, share lit and window the page shows, worked
 * out here. The page only draws.
 *
 * ONE SOURCE FOR EACH FACT. The light's heights are the Sky page's
 * (src/core/skyPage.ts lightMarks: golden +6°, blue −4°, dark −6°, measured on
 * suncalc's apparent altitude), sunrise and sunset suncalc's getTimes, the
 * moon's rise and set the venue's own day (src/core/moonTimes.ts), the Milky
 * Way the planner's (src/core/milkyWay.ts), the next big moonrise the
 * moonrise plan's own night (src/core/moonrisePlan.ts pickNight), the
 * showers the IMO table in src/core/celestial.ts.
 *
 * HELD AGAINST A SECOND EPHEMERIS. src/core/sunMoonNight.ephemeris.test.ts
 * works each time again from src/core/ephemeris2.ts (Meeus, no suncalc code)
 * and fails on any gap over five minutes.
 *
 * Never "clear", never "safe": the sky's cloud is the Sky page's business;
 * this page says where things are and when.
 */
import { getMoonIllumination, getMoonPosition, getPosition, getTimes } from 'suncalc'
import { equatorialToHorizontal, SHOWERS, type Shower } from './celestial.ts'
import { compassPoint } from './field.ts'
import { BRIGHT_MOON_FRACTION, hoursMinutes, milkyWayNight, type MilkyWayNight } from './milkyWay.ts'
import { localDate, moonTimesOnLocalDay } from './moonTimes.ts'
import { pickNight } from './moonrisePlan.ts'
import { moonTurningPoints } from './skyEvents.ts'
import { lightMarks } from './skyPage.ts'
import { normalizeBearing } from './sun.ts'
import { zonedTimeToUtc } from './timezone.ts'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

export type Clock = (at: Date) => string

/* -------------------------------------------------------------- the light */

export type SunPhase = 'day' | 'golden' | 'afterglow' | 'blue' | 'dark' | 'first-light'
export const SUN_PHASE_WORD: Record<SunPhase, string> = {
  day: 'Daylight',
  golden: 'Golden light',
  afterglow: 'Afterglow',
  blue: 'Blue hour',
  dark: 'Dark',
  'first-light': 'First light',
}

export type BoundaryKind = 'golden' | 'sunset' | 'blue' | 'dark' | 'dawn' | 'glow' | 'sunrise' | 'day'

export interface Boundary {
  kind: BoundaryKind
  at: Date
  /** The phase that begins here. */
  starts: SunPhase
}

const sunAlt = (lat: number, lon: number) => (t: Date) => getPosition(t, lat, lon).altitude

/**
 * Every edge of the light between two instants, sorted. Evening: golden (+6°)
 * · sunset · blue (−4°) · dark (−6°). Morning: dawn (−6°, blue begins) · glow
 * (−4°) · sunrise · day (+6°, golden ends). The Sky page's own marks.
 */
export function sunBoundaries(from: Date, to: Date, lat: number, lon: number): Boundary[] {
  const alt = sunAlt(lat, lon)
  const out: Boundary[] = []
  const seen = new Set<string>()
  const push = (kind: BoundaryKind, at: Date | null, starts: SunPhase) => {
    if (at === null || !usable(at)) return
    const key = `${kind}${Math.round(at.getTime() / MIN)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ kind, at, starts })
  }
  for (let t = from.getTime() - DAY; t <= to.getTime() + DAY; t += DAY) {
    const times = getTimes(new Date(t), lat, lon)
    if (usable(times.sunset)) {
      const [golden, set, blue, dark] = lightMarks('sunset', times.sunset, alt)
      push('golden', golden.at, 'golden')
      push('sunset', set.at, 'afterglow')
      push('blue', blue.at, 'blue')
      push('dark', dark.at, 'dark')
    }
    if (usable(times.sunrise)) {
      const [dawn, glow, rise, day] = lightMarks('sunrise', times.sunrise, alt)
      push('dawn', dawn.at, 'blue')
      push('glow', glow.at, 'first-light')
      push('sunrise', rise.at, 'golden')
      push('day', day.at, 'day')
    }
  }
  return out.filter((b) => b.at.getTime() >= from.getTime() && b.at.getTime() <= to.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** The phase from the sun's height alone, where the day has no edges (far north or south). */
function phaseByHeight(alt: number, falling: boolean): SunPhase {
  if (alt >= 6) return 'day'
  if (alt >= -0.833) return 'golden'
  if (alt >= -4) return falling ? 'afterglow' : 'first-light'
  if (alt >= -6) return 'blue'
  return 'dark'
}

export interface SunHero {
  phase: SunPhase
  word: string
  /** When this phase ends, or null where it does not within a day and a half. */
  endsAt: Date | null
  minutesLeft: number | null
  altitude: number
  azimuth: number
  /** The next sunset or sunrise, and where. */
  next: { kind: 'sunset' | 'sunrise'; at: Date; azimuth: number } | null
  /** The next start of golden light (evening +6° or sunrise), for the night's "Next golden". */
  nextGolden: Date | null
}

export function sunHero(now: Date, lat: number, lon: number): SunHero {
  const b = sunBoundaries(new Date(now.getTime() - 36 * HOUR), new Date(now.getTime() + 36 * HOUR), lat, lon)
  const p = getPosition(now, lat, lon)
  const before = b.filter((x) => x.at.getTime() <= now.getTime())
  const after = b.filter((x) => x.at.getTime() > now.getTime())
  const falling = getPosition(new Date(now.getTime() + MIN), lat, lon).altitude < p.altitude
  const phase = before.length > 0 ? before[before.length - 1].starts : phaseByHeight(p.altitude, falling)
  const endsAt = after[0]?.at ?? null
  const nextEvent = after.find((x) => x.kind === 'sunset' || x.kind === 'sunrise') ?? null
  const nextGolden = after.find((x) => x.kind === 'golden' || x.kind === 'sunrise')?.at ?? null
  return {
    phase,
    word: SUN_PHASE_WORD[phase],
    endsAt,
    minutesLeft: endsAt === null ? null : Math.round((endsAt.getTime() - now.getTime()) / MIN),
    altitude: p.altitude,
    azimuth: normalizeBearing(p.azimuth),
    next: nextEvent === null ? null : { kind: nextEvent.kind as 'sunset' | 'sunrise', at: nextEvent.at, azimuth: normalizeBearing(getPosition(nextEvent.at, lat, lon).azimuth) },
    nextGolden,
  }
}

/** "14 min left · sunset 6:12 PM in the WSW"; in the day, "golden light from 4:22 PM · sunset …". */
export function sunHeroLine(h: SunHero, clock: Clock, now: Date): string {
  const next = h.next === null ? null : `${h.next.kind} ${clock(h.next.at)} in the ${compassPoint(h.next.azimuth)}`
  let lead: string | null = null
  if (h.phase === 'day') lead = h.nextGolden === null ? null : `golden light from ${clock(h.nextGolden)}`
  else if (h.minutesLeft !== null && h.phase !== 'dark') lead = `${hoursMinutes(h.minutesLeft).replace(/^(\d+) m$/, '$1 min')} left`
  else if (h.phase === 'dark' && h.endsAt !== null && h.endsAt.getTime() > now.getTime()) lead = `first light ${clock(h.endsAt)}`
  return [lead, next].filter((x): x is string => x !== null).join(' · ')
}

/** "Sun 2° up", "Sun 3° down". */
export function sunHeightWords(altitude: number): string {
  const d = Math.round(Math.abs(altitude))
  return altitude >= 0 ? `Sun ${d}° up` : `Sun ${d}° down`
}

export interface SunStrip {
  /** The sun's path, 0..1 across (azimuth) and down (height), every 5 minutes. */
  path: { x: number; y: number }[]
  sun: { x: number; y: number }
  horizonY: number
  /** Compass points along the horizon. */
  ticks: { x: number; label: string }[]
}

/**
 * The sun's path for the three hours round now, drawn by bearing across and
 * height up, with the horizon and the compass points it crosses.
 */
export function sunStrip(now: Date, lat: number, lon: number): SunStrip {
  const samples: { az: number; alt: number }[] = []
  for (let t = now.getTime() - 90 * MIN; t <= now.getTime() + 90 * MIN; t += 5 * MIN) {
    const p = getPosition(new Date(t), lat, lon)
    samples.push({ az: normalizeBearing(p.azimuth), alt: p.altitude })
  }
  const here = getPosition(now, lat, lon)
  /* Unwrapped round the sun now, so a path through north does not jump. */
  const centre = normalizeBearing(here.azimuth)
  const rel = (az: number) => ((az - centre + 540) % 360) - 180
  const xs = samples.map((s) => rel(s.az))
  const spanAz = Math.max(30, ...xs.map((x) => Math.abs(x))) * 1.15
  const top = Math.max(10, ...samples.map((s) => s.alt)) + 2
  const bottom = Math.min(-6, ...samples.map((s) => s.alt)) - 2
  const X = (az: number) => 0.5 + rel(az) / (2 * spanAz)
  const Y = (alt: number) => (top - alt) / (top - bottom)
  const ticks: { x: number; label: string }[] = []
  for (let b = 0; b < 360; b += 22.5) {
    const r = rel(b)
    if (Math.abs(r) < spanAz * 0.92 && (b % 45 === 0 || spanAz < 50)) ticks.push({ x: X(b), label: compassPoint(b) })
  }
  return {
    path: samples.map((s) => ({ x: X(s.az), y: Y(s.alt) })),
    sun: { x: X(normalizeBearing(here.azimuth)), y: Y(here.altitude) },
    horizonY: Y(0),
    ticks,
  }
}

/* ------------------------------------------------------- the moon's times */

export interface MoonEvent {
  kind: 'rise' | 'set'
  at: Date
}

function nextDateOf(date: string, days = 1): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Every moonrise and moonset between two instants, on the venue's own days, sorted. */
export function moonEvents(from: Date, to: Date, lat: number, lon: number, timeZone: string): MoonEvent[] {
  const out: MoonEvent[] = []
  let date = localDate(from, timeZone)
  const last = localDate(to, timeZone)
  for (let i = 0; i < 40 && date <= last; i += 1, date = nextDateOf(date)) {
    const noon = zonedTimeToUtc(date, '12:00', timeZone)
    if (noon === null) continue
    const t = moonTimesOnLocalDay(noon, lat, lon, timeZone)
    if (t.rise !== null) out.push({ kind: 'rise', at: t.rise })
    if (t.set !== null) out.push({ kind: 'set', at: t.set })
  }
  return out.filter((e) => e.at.getTime() >= from.getTime() && e.at.getTime() <= to.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())
}

const moonAz = (at: Date, lat: number, lon: number) => normalizeBearing(getMoonPosition(at, lat, lon).azimuth)

/* ------------------------------------------------------------ the Sun tab */

export interface TimelineRow {
  kind: 'golden' | 'sunset' | 'blue' | 'dark' | 'moonrise'
  label: string
  at: Date
  /** Sunset and moonrise: where. */
  azimuth: number | null
  /** Moonrise: share lit, 0..1. */
  lit: number | null
  /** Past, the one now (the last edge passed), or still to come. */
  state: 'past' | 'now' | 'next'
}

export interface SunTonight {
  rows: TimelineRow[]
  /** The night the Milky Way line is about: the local date tonight's sunset is on. */
  date: string | null
  sunset: Date | null
  /** Tomorrow's (the next) sunrise after tonight, and where. */
  sunrise: { at: Date; azimuth: number } | null
}

const ROW_LABEL: Record<TimelineRow['kind'], string> = { golden: 'Golden light', sunset: 'Sunset', blue: 'Blue hour', dark: 'Dark', moonrise: 'Moonrise' }

/**
 * Tonight: golden, sunset, blue hour, dark, and a moonrise between golden
 * light and the next sunrise. Tonight is this evening until its dark has
 * come, then the next one.
 */
export function sunTonight(now: Date, lat: number, lon: number, timeZone: string): SunTonight {
  const b = sunBoundaries(new Date(now.getTime() - 12 * HOUR), new Date(now.getTime() + 48 * HOUR), lat, lon)
  const sets = b.filter((x) => x.kind === 'sunset')
  const evening = sets.find((s) => {
    const dark = b.find((x) => x.kind === 'dark' && x.at.getTime() > s.at.getTime() && x.at.getTime() - s.at.getTime() < 3 * HOUR)
    return (dark?.at.getTime() ?? s.at.getTime() + HOUR) > now.getTime()
  }) ?? null
  if (evening === null) return { rows: [], date: null, sunset: null, sunrise: null }
  const near = (kind: BoundaryKind, after: boolean) =>
    b.find((x) => x.kind === kind && Math.abs(x.at.getTime() - evening.at.getTime()) < 4 * HOUR && (after ? x.at >= evening.at : x.at <= evening.at)) ?? null
  const golden = near('golden', false)
  const blue = near('blue', true)
  const dark = near('dark', true)
  const sunrise = b.find((x) => x.kind === 'sunrise' && x.at.getTime() > evening.at.getTime()) ?? null
  const rows: Omit<TimelineRow, 'state'>[] = []
  if (golden !== null) rows.push({ kind: 'golden', label: ROW_LABEL.golden, at: golden.at, azimuth: null, lit: null })
  rows.push({ kind: 'sunset', label: ROW_LABEL.sunset, at: evening.at, azimuth: normalizeBearing(getPosition(evening.at, lat, lon).azimuth), lit: null })
  if (blue !== null) rows.push({ kind: 'blue', label: ROW_LABEL.blue, at: blue.at, azimuth: null, lit: null })
  if (dark !== null) rows.push({ kind: 'dark', label: ROW_LABEL.dark, at: dark.at, azimuth: null, lit: null })
  const windowFrom = golden?.at ?? evening.at
  const windowTo = sunrise?.at ?? new Date(evening.at.getTime() + 14 * HOUR)
  const rise = moonEvents(windowFrom, windowTo, lat, lon, timeZone).find((e) => e.kind === 'rise') ?? null
  if (rise !== null) rows.push({ kind: 'moonrise', label: ROW_LABEL.moonrise, at: rise.at, azimuth: moonAz(rise.at, lat, lon), lit: getMoonIllumination(rise.at).fraction })
  rows.sort((x, y) => x.at.getTime() - y.at.getTime())
  const passed = rows.filter((r) => r.at.getTime() <= now.getTime()).length
  return {
    rows: rows.map((r, i) => ({ ...r, state: i < passed - 1 ? 'past' : i === passed - 1 ? 'now' : 'next' })),
    date: localDate(evening.at, timeZone),
    sunset: evening.at,
    sunrise: sunrise === null ? null : { at: sunrise.at, azimuth: normalizeBearing(getPosition(sunrise.at, lat, lon).azimuth) },
  }
}

/** "Milky Way: 9:40 PM–11:20 PM, the core up to 18°." or "Milky Way: not tonight. <why>" */
export function milkyWayLine(n: MilkyWayNight, clock: Clock): string {
  if (n.window === null) return `Milky Way: not tonight. ${n.reason}`
  return `Milky Way: ${clock(n.window.from)}–${clock(n.window.to)}, the core up to ${Math.round(n.maxCoreAltitude ?? 0)}°.`
}

/* ----------------------------------------------------------- the Moon tab */

export interface MoonTonight {
  /** Up now: the rise was before now. */
  up: boolean
  rise: { at: Date; azimuth: number } | null
  highest: { at: Date; altitude: number; azimuth: number } | null
  set: { at: Date; azimuth: number } | null
  /** At the rise (or now, up): 0..1 lit and suncalc's phase, 0 new to 0.5 full. */
  lit: number
  phase: number
  /** Minutes the rise is after that evening's sunset; negative before it. Null without both. */
  afterSunsetMin: number | null
  /** Bright enough to wash out the Milky Way (the planner's own line). */
  bright: boolean
}

export function moonTonight(now: Date, lat: number, lon: number, timeZone: string): MoonTonight {
  const ev = moonEvents(new Date(now.getTime() - 30 * HOUR), new Date(now.getTime() + 54 * HOUR), lat, lon, timeZone)
  const last = [...ev].reverse().find((e) => e.at.getTime() <= now.getTime()) ?? null
  const up = last !== null ? last.kind === 'rise' : getMoonPosition(now, lat, lon).altitude > 0
  const riseE = up ? last : (ev.find((e) => e.kind === 'rise' && e.at.getTime() > now.getTime()) ?? null)
  const from = riseE?.at ?? now
  const setE = ev.find((e) => e.kind === 'set' && e.at.getTime() > from.getTime()) ?? null
  const ref = up ? now : from
  const ill = getMoonIllumination(ref)
  /* The highest point between rise and set: every 5 minutes, then the minute. */
  let highest: MoonTonight['highest'] = null
  if (riseE !== null) {
    const end = setE?.at.getTime() ?? riseE.at.getTime() + 15 * HOUR
    let best = -Infinity
    let bestT = riseE.at.getTime()
    for (let t = riseE.at.getTime(); t <= end; t += 5 * MIN) {
      const a = getMoonPosition(new Date(t), lat, lon).altitude
      if (a > best) {
        best = a
        bestT = t
      }
    }
    for (let t = bestT - 5 * MIN; t <= bestT + 5 * MIN; t += MIN) {
      const a = getMoonPosition(new Date(t), lat, lon).altitude
      if (a > best) {
        best = a
        bestT = t
      }
    }
    highest = { at: new Date(bestT), altitude: best, azimuth: moonAz(new Date(bestT), lat, lon) }
  }
  let afterSunsetMin: number | null = null
  if (riseE !== null) {
    const noon = zonedTimeToUtc(localDate(riseE.at, timeZone), '12:00', timeZone)
    const sunset = noon === null ? null : getTimes(noon, lat, lon).sunset
    if (usable(sunset)) afterSunsetMin = Math.round((riseE.at.getTime() - sunset.getTime()) / MIN)
  }
  return {
    up,
    rise: riseE === null ? null : { at: riseE.at, azimuth: moonAz(riseE.at, lat, lon) },
    highest,
    set: setE === null ? null : { at: setE.at, azimuth: moonAz(setE.at, lat, lon) },
    lit: ill.fraction,
    phase: ill.phase,
    afterSunsetMin,
    bright: ill.fraction >= BRIGHT_MOON_FRACTION,
  }
}

/** "1 h 29 m after sunset", "19 min before sunset", "at sunset". */
export function sunsetGapWords(min: number): string {
  if (Math.abs(min) < 1) return 'at sunset'
  const span = hoursMinutes(Math.abs(min)).replace(/^(\d+) m$/, '$1 min')
  return `${span} ${min > 0 ? 'after' : 'before'} sunset`
}

export interface MoonDay {
  date: string
  /** Local 9 PM that day: the evening's moon. */
  at: Date
  lit: number
  phase: number
}

/** The next `days` evenings' moons, from today. */
export function moonFortnight(now: Date, timeZone: string, days = 14): MoonDay[] {
  const out: MoonDay[] = []
  let date = localDate(now, timeZone)
  for (let i = 0; i < days; i += 1, date = nextDateOf(date)) {
    const at = zonedTimeToUtc(date, '21:00', timeZone)
    if (at === null) continue
    const ill = getMoonIllumination(at)
    out.push({ date, at, lit: ill.fraction, phase: ill.phase })
  }
  return out
}

/** A night is among the darkest when the moon at its middle (local midnight) is under this share lit. */
export const DARKEST_LIT = 0.2

/**
 * The darkest run of nights round the next new moon still to come (or the
 * one now): the nights whose moon at local midnight is under DARKEST_LIT
 * lit, each named by the date its evening is on.
 */
export function darkestNights(now: Date, timeZone: string): { from: string; to: string; newMoon: Date } | null {
  const { newMoons } = moonTurningPoints(new Date(now.getTime() - 5 * DAY), new Date(now.getTime() + 40 * DAY), (at) => getMoonIllumination(at).fraction)
  const today = localDate(now, timeZone)
  for (const nm of newMoons) {
    const litAt = (date: string) => {
      const midnight = zonedTimeToUtc(nextDateOf(date), '00:00', timeZone)
      return midnight === null ? 1 : getMoonIllumination(midnight).fraction
    }
    const centre = localDate(new Date(nm.at.getTime() - 12 * HOUR), timeZone)
    let from = centre
    let to = centre
    for (let i = 0; i < 10 && litAt(nextDateOf(from, -1)) < DARKEST_LIT; i += 1) from = nextDateOf(from, -1)
    for (let i = 0; i < 10 && litAt(nextDateOf(to)) < DARKEST_LIT; i += 1) to = nextDateOf(to)
    if (to < today) continue
    return { from: from < today ? today : from, to, newMoon: nm.at }
  }
  return null
}

export interface BigMoonrise {
  date: string
  moonrise: Date
  /** Minutes the moon rises before sunset; negative after. */
  leadMinutes: number | null
  lit: number
}

/** The moonrise plan's own night (src/core/moonrisePlan.ts pickNight): the full moon's best rise. */
export function nextBigMoonrise(now: Date, lat: number, lon: number, timeZone: string): BigMoonrise | null {
  const { best } = pickNight({ lat, lon }, timeZone, now)
  if (best === null || best.moonrise === null) return null
  return { date: best.date, moonrise: best.moonrise, leadMinutes: best.leadMinutes, lit: best.fraction }
}

/* ---------------------------------------------------------- the Night tab */

/*
 * POLARIS, J2000: RA 02h 31m 49.09s, Dec +89° 15′ 51.2″ (Hipparcos, HIP 11767).
 * No precession: by 2026 it has moved about 0.1° nearer the pole, which moves
 * its height by under a tenth of a degree and its bearing by under one at
 * mid-latitudes; the page says a compass point and a whole degree.
 */
export const POLARIS = { ra: (2 + 31 / 60 + 49.09 / 3600) * 15, dec: 89 + 15 / 60 + 51.2 / 3600 } as const

export function northStar(at: Date, lat: number, lon: number): { azimuth: number; altitude: number } {
  return equatorialToHorizontal(POLARIS.ra, POLARIS.dec, lat, lon, at)
}

/** The longest stretch of full dark (sun 18° down) with the moon down, sampled every 5 minutes. */
export function darkestWindow(night: MilkyWayNight, lat: number, lon: number): { from: Date; to: Date } | null {
  if (night.dark === null) return null
  const times: Date[] = []
  for (let t = night.dark.from.getTime(); t < night.dark.to.getTime(); t += 5 * MIN) times.push(new Date(t))
  times.push(night.dark.to)
  let best: { from: Date; to: Date } | null = null
  let start: Date | null = null
  let prev: Date | null = null
  for (const at of [...times, null]) {
    const down = at !== null && getMoonPosition(at, lat, lon).altitude < 0
    if (down && start === null) start = at
    if (!down && start !== null && prev !== null) {
      if (prev.getTime() > start.getTime() && (best === null || prev.getTime() - start.getTime() > best.to.getTime() - best.from.getTime())) best = { from: start, to: prev }
      start = null
    }
    prev = at
  }
  return best
}

export interface ShowerNext {
  shower: Shower
  /** The peak's calendar date, yyyy-mm-dd, and the two nights offered: the night before and the night of. */
  peak: string
  nights: [string, string]
  /** The moon's share lit at local midnight of the peak night. */
  lit: number
  /** Days from today to the peak. */
  inDays: number
}

/** The next shower in the IMO table (src/core/celestial.ts) whose peak night has not passed. */
export function nextShower(now: Date, timeZone: string): ShowerNext | null {
  const today = localDate(now, timeZone)
  const year = Number(today.slice(0, 4))
  const list = [year, year + 1]
    .flatMap((y) => SHOWERS.map((s) => ({ s, peak: `${y}-${String(s.peakMonth).padStart(2, '0')}-${String(s.peakDay).padStart(2, '0')}` })))
    .filter((x) => x.peak >= today)
    .sort((a, b) => (a.peak < b.peak ? -1 : 1))
  const first = list[0]
  if (first === undefined) return null
  const midnight = zonedTimeToUtc(first.peak, '00:00', timeZone)
  const days = Math.round((Date.parse(first.peak) - Date.parse(today)) / DAY)
  return { shower: first.s, peak: first.peak, nights: [nextDateOf(first.peak, -1), first.peak], lit: midnight === null ? 0 : getMoonIllumination(midnight).fraction, inDays: days }
}

export interface NightEvent {
  kind: 'dark' | 'full-dark' | 'moonrise' | 'moonset' | 'milky-way' | 'first-light' | 'golden'
  label: string
  at: Date
}

export interface NightRead {
  /** The moment the hero is about: now in the dark, else tonight's dark. */
  at: Date
  isNow: boolean
  moon: { up: boolean; lit: number; phase: number; altitude: number; azimuth: number }
  milkyWay: MilkyWayNight
  darkest: { from: Date; to: Date } | null
  north: { azimuth: number; altitude: number }
  /** What comes next, soonest first, within a day. */
  next: NightEvent[]
  nextGolden: Date | null
}

export function nightRead(now: Date, lat: number, lon: number, timeZone: string): NightRead {
  const b = sunBoundaries(new Date(now.getTime() - 24 * HOUR), new Date(now.getTime() + 36 * HOUR), lat, lon)
  const lastDark = [...b].reverse().find((x) => x.at.getTime() <= now.getTime() && (x.kind === 'dark' || x.kind === 'dawn')) ?? null
  const inNight = lastDark !== null && lastDark.kind === 'dark'
  const nextDark = b.find((x) => x.kind === 'dark' && x.at.getTime() > now.getTime()) ?? null
  const at = inNight ? now : (nextDark?.at ?? now)
  const evening = inNight ? lastDark.at : at
  const mw = milkyWayNight(localDate(new Date(evening.getTime() - 4 * HOUR), timeZone), lat, lon, timeZone)
  const mp = getMoonPosition(at, lat, lon)
  const ill = getMoonIllumination(at)
  const ev = moonEvents(new Date(at.getTime() - 30 * HOUR), new Date(at.getTime() + 30 * HOUR), lat, lon, timeZone)
  const lastMoon = [...ev].reverse().find((e) => e.at.getTime() <= at.getTime()) ?? null
  const up = lastMoon !== null ? lastMoon.kind === 'rise' : mp.altitude > 0
  const horizon = now.getTime() + 24 * HOUR
  const next: NightEvent[] = []
  const add = (kind: NightEvent['kind'], label: string, t: Date | null | undefined) => {
    if (t != null && t.getTime() > now.getTime() && t.getTime() <= horizon) next.push({ kind, label, at: t })
  }
  add('dark', 'Dark', nextDark?.at)
  add('full-dark', 'Full dark', mw.dark?.from)
  add('milky-way', 'Milky Way core up', mw.window?.from)
  for (const e of ev) add(e.kind === 'rise' ? 'moonrise' : 'moonset', e.kind === 'rise' ? 'Moonrise' : 'Moonset', e.at)
  add('first-light', 'First light', b.find((x) => x.kind === 'dawn' && x.at.getTime() > now.getTime())?.at)
  const nextGolden = b.find((x) => (x.kind === 'golden' || x.kind === 'sunrise') && x.at.getTime() > now.getTime())?.at ?? null
  add('golden', 'Golden light', nextGolden)
  next.sort((x, y) => x.at.getTime() - y.at.getTime())
  return {
    at,
    isNow: inNight,
    moon: { up, lit: ill.fraction, phase: ill.phase, altitude: mp.altitude, azimuth: normalizeBearing(mp.azimuth) },
    milkyWay: mw,
    darkest: darkestWindow(mw, lat, lon),
    north: northStar(at, lat, lon),
    next,
    nextGolden,
  }
}

/** "Moon up, 88%" / "Moon down"; and "ENE, 18° up · bright, no Milky Way". */
export function nightHeroWords(n: NightRead): { title: string; line: string } {
  const pct = Math.round(n.moon.lit * 100)
  const mw = n.milkyWay.window === null ? 'no Milky Way' : 'Milky Way tonight'
  if (n.moon.up) {
    const where = n.moon.altitude >= 0 ? `${compassPoint(n.moon.azimuth)}, ${Math.round(n.moon.altitude)}° up` : `${compassPoint(n.moon.azimuth)}, on the horizon`
    return { title: `Moon up, ${pct}%`, line: `${where} · ${n.moon.lit >= BRIGHT_MOON_FRACTION ? 'bright' : 'faint'}, ${mw}` }
  }
  return { title: 'Moon down', line: `${pct}% lit · ${mw}` }
}

/** "N, 37° up"; south of the equator, "below the horizon here". */
export function northStarWords(p: { azimuth: number; altitude: number }): string {
  if (p.altitude < 0) return 'below the horizon here'
  return `${compassPoint(p.azimuth)}, ${Math.round(p.altitude)}° up`
}

/* ------------------------------------------------------------ the words */

export type SmnTab = 'sun' | 'moon' | 'night'

/** Which tab the page opens on, asked without one: the night's in the dark, else the sun's. */
export function opensOn(phase: SunPhase): SmnTab {
  return phase === 'dark' ? 'night' : 'sun'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const parts = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return { m, d, w: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

/** "Tue 24 Nov", from a yyyy-mm-dd calendar date (no clock: the date is the venue's own). */
export function dayWords(date: string): string {
  const p = parts(date)
  return `${WEEKDAYS[p.w]} ${p.d} ${MONTHS[p.m - 1]}`
}

/** "Today", "Tomorrow" or the weekday of an instant, on the venue's calendar. */
export function dayFromNow(at: Date, now: Date, timeZone: string): string {
  const d = localDate(at, timeZone)
  const today = localDate(now, timeZone)
  if (d === today) return 'Today'
  if (d === nextDateOf(today)) return 'Tomorrow'
  return weekdayWord(d)
}

/** "Tue", from a yyyy-mm-dd. */
export function weekdayWord(date: string): string {
  return WEEKDAYS[parts(date).w]
}

/** "Dec 4–12", "Nov 29–Dec 3", "Dec 4". */
export function dayRangeWords(from: string, to: string): string {
  const a = parts(from)
  const b = parts(to)
  if (from === to) return `${MONTHS[a.m - 1]} ${a.d}`
  return a.m === b.m ? `${MONTHS[a.m - 1]} ${a.d}–${b.d}` : `${MONTHS[a.m - 1]} ${a.d}–${MONTHS[b.m - 1]} ${b.d}`
}

/** "Rises 4:32 PM, 12 min before sunset". */
export function bigMoonriseLine(m: BigMoonrise, clock: Clock): string {
  return m.leadMinutes === null ? `Rises ${clock(m.moonrise)}` : `Rises ${clock(m.moonrise)}, ${sunsetGapWords(-m.leadMinutes)}`
}

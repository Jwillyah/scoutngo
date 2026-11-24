/*
 * THE MOON'S MOMENT ON THE HOME (Batch SIMPLE-3, Section 2b; mockup
 * Home_Moon). Jwilly, 23 Nov: "tomorrow's supermoon should pop up".
 *
 * Three moments, all computed, none of them asked of a model:
 *
 *   Supermoon           a full moon whose Earth-Moon distance at the full
 *                       instant is SUPERMOON_MAX_KM or less
 *   Big moonrise        src/core/moonNights.ts moonMoments (full ±1 day,
 *                       rising within 45 min of sunset)
 *   Moonset at sunrise  moonMoments again (95% lit or more, setting within
 *                       30 min of sunrise)
 *
 * ONE SOURCE FOR EACH FACT:
 *
 *   full instant        src/core/moonPhases.ts (Meeus 49)
 *   distance            suncalc 2.0.2 getMoonPosition's `distance`: Meeus
 *                       chapter 47 with every distance term of table 47.A, on
 *                       Terrestrial Time. It gives Meeus's own worked example
 *                       47.a to the 0.1 km (368,409.7 km at 1992 Apr 12 0h TD;
 *                       tests/moonMoment.test.ts), and is held to the
 *                       check-only src/core/ephemeris2.ts (13 distance terms,
 *                       no shared code) within 200 km at every full moon of
 *                       2026-27: measurements/2026-11-24-supermoon.md
 *   rise, set, bearing  moonMoments / moonTimes.ts, the Night tab's own
 *   sunrise, sunset     suncalc getTimes at local noon, as moonMoments
 *
 * WHEN IT SHOWS. From the sunset the evening before the event's date through
 * the event: a rise stays MOON_RISE_AFTER_MS past it (the moon low and big),
 * a set ends at the set. A Supermoon always shows (`always`, which the home's
 * pickMoment puts ahead of the persona's rank); otherwise the moon's moments
 * take the 'moonrise' place in MOMENT_RANK (src/core/homeTiles.ts).
 *
 * Never "clear", never "safe": whether cloud hides the moon is the Sky
 * page's call, not this file's.
 */
import { getMoonIllumination, getMoonPosition, getTimes } from 'suncalc'
import { compassPoint } from './field.ts'
import type { Moment } from './homeTiles.ts'
import { moonMoments, tonightDate, type Bearing } from './moonNights.ts'
import { moonPhasesBetween } from './moonPhases.ts'
import { localDate, moonTimesOnLocalDay } from './moonTimes.ts'
import { normalizeBearing } from './sun.ts'
import { formatClock, wallClock, zonedTimeToUtc } from './timezone.ts'

const MIN = 60_000
const DAY = 86_400_000
const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** A supermoon: the Earth-Moon distance at the full instant this many km or less (the batch's rule). */
export const SUPERMOON_MAX_KM = 362_000
/** A rising moon's card stays this long after the rise. */
export const MOON_RISE_AFTER_MS = 30 * MIN
/** "at sunset" / "at sunrise" within this many minutes; else "11 min before sunset". */
export const AT_SUN_MINUTES = 15
/** The Go alert fires this long before a Supermoon's rise. */
export const MOON_ALERT_LEAD_MS = 15 * MIN

/** The Earth-Moon distance, centre to centre, km (suncalc's Meeus 47; the observer does not enter). */
export function moonDistanceKm(at: Date): number {
  return getMoonPosition(at, 0, 0).distance
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const bearing = (at: Date, lat: number, lon: number): Bearing => {
  const azimuth = normalizeBearing(getMoonPosition(at, lat, lon).azimuth)
  return { at, azimuth, compass: compassPoint(azimuth) }
}

function sunOn(date: string, lat: number, lon: number, timeZone: string): { sunrise: Date | null; sunset: Date | null } {
  const noon = zonedTimeToUtc(date, '12:00', timeZone)
  if (noon === null) return { sunrise: null, sunset: null }
  const t = getTimes(noon, lat, lon)
  return { sunrise: usable(t.sunrise) ? t.sunrise : null, sunset: usable(t.sunset) ? t.sunset : null }
}

/* ----------------------------------------------------------- supermoons */

export interface Supermoon {
  fullMoon: Date
  /** At the full instant, km. */
  distanceKm: number
  /** The night of the full moon, yyyy-mm-dd on the venue's calendar (moonNights.ts tonightDate of the instant). */
  date: string
  /** That night's moonrise, or null when the moon's day has none. */
  moonrise: Bearing | null
  sunset: Date | null
  /** Positive: rises this many minutes before sunset; negative, after. Null without both. */
  minutesBeforeSunset: number | null
  lit: number
}

/** Every full moon from `from` to `to` at SUPERMOON_MAX_KM or closer, with the night it belongs to. */
export function supermoonsBetween(from: Date, to: Date, lat: number, lon: number, timeZone: string): Supermoon[] {
  return moonPhasesBetween(from, to)
    .filter((p) => p.kind === 'full')
    .map((p) => ({ p, km: moonDistanceKm(p.at) }))
    .filter(({ km }) => km <= SUPERMOON_MAX_KM)
    .map(({ p, km }) => {
      const date = tonightDate(p.at, lat, lon, timeZone)
      let rise: Date | null = null
      let riseDate = date
      for (const d of [date, shiftDate(date, 1)]) {
        const noon = zonedTimeToUtc(d, '12:00', timeZone)
        const r = noon === null ? null : moonTimesOnLocalDay(noon, lat, lon, timeZone).rise
        if (r !== null) {
          rise = r
          riseDate = d
          break
        }
      }
      const { sunset } = sunOn(riseDate, lat, lon, timeZone)
      return {
        fullMoon: p.at,
        distanceKm: km,
        date,
        moonrise: rise === null ? null : bearing(rise, lat, lon),
        sunset,
        minutesBeforeSunset: rise === null || sunset === null ? null : Math.round((sunset.getTime() - rise.getTime()) / MIN),
        lit: getMoonIllumination(rise ?? p.at).fraction,
      }
    })
}

/* ----------------------------------------------------- the home's moment */

export type MoonMomentKind = 'supermoon' | 'big-moonrise' | 'moonset-at-sunrise'

export interface MoonHomeMoment extends Moment {
  kind: 'moonrise'
  target: 'sky-night'
  which: MoonMomentKind
  /** A Supermoon: shown whatever the persona's rank. */
  always: boolean
  /** The rise or the set. */
  event: Bearing
  /** Shown from (the sunset the evening before) … */
  from: Date
  /** … until (the rise + MOON_RISE_AFTER_MS, or the set). */
  until: Date
}

/* The home's own short form ("5 PM"). Rise and set come rounded to the nearest minute from moonTimes.ts. */
const clock = (d: Date, timeZone: string) => formatClock(d, timeZone).replace(/:00 /, ' ')
const dayLabel = (at: Date, timeZone: string) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', day: 'numeric' }).formatToParts(at)
  return `${p.find((x) => x.type === 'weekday')?.value ?? ''} ${p.find((x) => x.type === 'day')?.value ?? ''}`
}
const hourOf = (at: Date, timeZone: string) => wallClock(at, timeZone)?.hour ?? 12

/** "tomorrow", "tonight", "this morning", "up now": the event's day from now, in the spot's zone. */
function whenWord(event: Date, now: Date, timeZone: string, rising: boolean): string {
  if (rising && now.getTime() >= event.getTime()) return 'up now'
  const d = localDate(event, timeZone)
  const today = localDate(now, timeZone)
  if (d === today) return hourOf(event, timeZone) < 12 ? 'this morning' : 'tonight'
  if (d === shiftDate(today, 1)) return 'tomorrow'
  return ''
}

/** "at sunset", "40 min before sunset", "20 min after sunrise". `lead` positive: the moon's event before the sun's. */
function sunWords(lead: number, sun: 'sunset' | 'sunrise'): string {
  if (Math.abs(lead) <= AT_SUN_MINUTES) return `at ${sun}`
  return lead > 0 ? `${lead} min before ${sun}` : `${-lead} min after ${sun}`
}

interface Candidate {
  which: MoonMomentKind
  event: Bearing
  rising: boolean
  /** Positive: the moon's event before the sun's. */
  lead: number | null
  lit: number
}

function build(c: Candidate, now: Date, lat: number, lon: number, timeZone: string): MoonHomeMoment | null {
  const eventDate = localDate(c.event.at, timeZone)
  const evening = sunOn(shiftDate(eventDate, -1), lat, lon, timeZone).sunset
  const from = evening ?? new Date(c.event.at.getTime() - DAY)
  const until = c.rising ? new Date(c.event.at.getTime() + MOON_RISE_AFTER_MS) : c.event.at
  if (now.getTime() < from.getTime() || now.getTime() >= until.getTime()) return null
  const name = c.which === 'supermoon' ? 'Supermoon' : c.which === 'big-moonrise' ? 'Big moonrise' : 'Moonset at sunrise'
  const word = whenWord(c.event.at, now, timeZone, c.rising)
  const eyebrow = `${name}${word === '' ? '' : ` ${word}`} · ${dayLabel(c.event.at, timeZone)}`
  const tail = c.lead === null ? `${Math.round(c.lit * 100)}% lit` : sunWords(c.lead, c.rising ? 'sunset' : 'sunrise')
  const line = !c.rising
    ? `Sets ${clock(c.event.at, timeZone)} ${c.event.compass} · ${tail}`
    : now.getTime() >= c.event.at.getTime()
      ? `Rose ${clock(c.event.at, timeZone)} ${c.event.compass} · look ${compassPoint(normalizeBearing(getMoonPosition(now, lat, lon).azimuth))}`
      : `Rises ${clock(c.event.at, timeZone)} ${c.event.compass} · ${tail}`
  return { kind: 'moonrise', at: c.event.at, eyebrow, line, target: 'sky-night', which: c.which, always: c.which === 'supermoon', event: c.event, from, until }
}

/**
 * The moon's one moment for the home at `now`, or null. A Supermoon first
 * (it always shows); else the soonest Big moonrise or Moonset at sunrise
 * whose window holds now.
 *
 *   "Supermoon tomorrow · Tue 24" / "Rises 4:38 PM ENE · at sunset"
 *
 * (The card's eyebrow is set in capitals by its style.)
 */
export function moonHomeMoment(now: Date, lat: number, lon: number, timeZone: string): MoonHomeMoment | null {
  const back = new Date(now.getTime() - MOON_RISE_AFTER_MS)
  const supers: Candidate[] = supermoonsBetween(new Date(now.getTime() - 3 * DAY), new Date(now.getTime() + 3 * DAY), lat, lon, timeZone)
    .filter((s) => s.moonrise !== null)
    .map((s) => ({ which: 'supermoon', event: s.moonrise as Bearing, rising: true, lead: s.minutesBeforeSunset, lit: s.lit }))
  for (const c of supers) {
    const m = build(c, now, lat, lon, timeZone)
    if (m !== null) return m
  }
  const others: Candidate[] = moonMoments(back, lat, lon, timeZone, 2).map((m) =>
    m.kind === 'big-moonrise'
      ? { which: 'big-moonrise', event: m.moonrise, rising: true, lead: m.minutesBeforeSunset, lit: m.lit }
      : { which: 'moonset-at-sunrise', event: m.moonset, rising: false, lead: -m.minutesAfterSunrise, lit: m.lit },
  )
  for (const c of others.sort((a, b) => a.event.at.getTime() - b.event.at.getTime())) {
    const m = build(c, now, lat, lon, timeZone)
    if (m !== null) return m
  }
  return null
}

/* ------------------------------------------------------------ the Go alert */

export interface MoonAlert {
  /** MOON_ALERT_LEAD_MS before the rise. */
  fireAt: Date
  /** Never fired at or after this: the rise. */
  until: Date
  /** "Supermoon rising now · look ENE". */
  text: string
  /** One alert per rise: "supermoon-2026-11-24T21:38:00.000Z". */
  key: string
}

/**
 * The Supermoon's Go alert (Batch SIMPLE-3, 2b.2; same switch as color, on
 * the phone only): MOON_ALERT_LEAD_MS before the rise, never after it. Null
 * for any other moment, or once the rise has passed. Firing is the caller's.
 */
export function moonGoAlert(m: MoonHomeMoment | null, now: Date): MoonAlert | null {
  if (m === null || m.which !== 'supermoon' || now.getTime() >= m.event.at.getTime()) return null
  return {
    fireAt: new Date(m.event.at.getTime() - MOON_ALERT_LEAD_MS),
    until: m.event.at,
    text: `Supermoon rising now · look ${m.event.compass}`,
    key: `supermoon-${m.event.at.toISOString()}`,
  }
}

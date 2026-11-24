/*
 * THE DAY SHEET (Batch SIMPLE-3, Section 4; board docs/mockups/simple3/
 * Day_Sheet.png): one day at one spot, first light to last light, an hour a
 * row. Every number and word the page shows is worked out here; the page only
 * draws.
 *
 * ONE SOURCE FOR THE LIGHT. The edges of the light are src/core/sunMoonNight.ts
 * sunBoundaries, which reads src/core/skyPage.ts lightMarks, the marks the Sky
 * page's light bar (lightTimeline) is cut from: golden +6° to sunset, colour
 * (the afterglow) sunset to -4°, blue -4° to -6°, the morning the same the
 * other way. This file adds no second set of windows. Held against a second
 * ephemeris in src/core/daySheet.test.ts.
 *
 * THE BANDS, in this file's own words and nowhere else:
 *   Golden     the sun on the horizon to 6° up (sunrise to +6°, +6° to sunset)
 *   Warm side  6° to 15°     Side  15° to 30°     Top  30° and up
 *   soft       cloud cover 60% or more; Flat when it is 90% or more (daytime)
 *   Color      sunset on to the -4° mark, and the -4° mark on to sunrise
 *   Blue       -4° to -6°, either side of the night
 * Heights are suncalc's, as the Sky page measures them. The mockup's own
 * numbers are examples; these thresholds are this file's.
 *
 * THE ARROW is the way the light travels: the sun's compass bearing plus 180°.
 *
 * A value the forecast did not give is null, which the page shows as a dash.
 * Fog is an input (`fogAt`), not computed here: none given, no mark, no fog
 * line. Never says an hour or place is free of anything.
 */
import { getTimes } from 'suncalc'
import { compassPoint } from './field.ts'
import { sunBoundaries } from './sunMoonNight.ts'
import { getSunPosition, normalizeBearing } from './sun.ts'
import { formatClock, formatShortHour, wallClock, zonedTimeToUtc } from './timezone.ts'

const MIN = 60_000
const HOUR = 3_600_000

export const SOFT_CLOUD = 60
export const FLAT_CLOUD = 90
export const WARM_SIDE_DEG = 6
export const SIDE_DEG = 15
export const TOP_DEG = 30
/** Rain chance at or over this makes a warning (percent). */
export const RAIN_WARN = 40
/** Wind at or over this makes a warning (m/s, 15 kt). */
export const WIND_WARN_MPS = 15 * (1852 / 3600)

/** The forecast's hourly names this sheet reads. */
export type DayWxName = 'cloud_cover' | 'wind_speed_10m' | 'wind_direction_10m' | 'precipitation_probability'
/** The forecast at an instant; null where it did not say. */
export type DayWx = (name: DayWxName, at: Date) => number | null

export type BandKind = 'golden' | 'side' | 'top' | 'color' | 'blue'

export interface DayInput {
  /** The venue's day, "YYYY-MM-DD". */
  date: string
  lat: number
  lon: number
  timeZone: string
  now: Date
  wx: DayWx | null
  /** Whether fog risk is high in the hour starting at this instant; null where the risk was not worked out. Absent: no fog mark. */
  fogAt?: (hourStart: Date) => boolean | null
  /** How a wind speed in m/s is written, in the user's unit. Default knots. */
  windWords?: (mps: number) => string
}

export interface LightEdges {
  /** Morning: the -6° mark, blue begins. */
  blueFrom: Date | null
  /** Morning: the -4° mark, colour begins (the glow). */
  colorFrom: Date | null
  sunrise: Date | null
  /** Morning golden ends at +6°. */
  goldenEnds: Date | null
  /** Evening golden begins at +6°. */
  goldenStarts: Date | null
  sunset: Date | null
  /** Evening: the -4° mark, colour ends and blue begins. */
  colorTo: Date | null
  /** Evening: the -6° mark, blue ends. */
  blueTo: Date | null
  noon: { at: Date; altitude: number } | null
}

export interface DayHour {
  start: Date
  /** "6a", through formatShortHour. */
  label: string
  /** Sun height at the top of the hour, degrees (negative below the horizon). */
  altitude: number
  /** Sun compass bearing at the top of the hour. */
  azimuth: number
  /** Which way the light travels: azimuth + 180. */
  travel: number
  /** "Golden", "Warm side", "Side · soft", "Color 4:50 PM", "Blue 5:10 PM"; the page prefixes nothing. */
  word: string
  band: BandKind | null
  cloud: number | null
  windMps: number | null
  windFrom: string | null
  rain: number | null
  fog: boolean
  current: boolean
}

export interface BandSpan {
  band: BandKind
  from: number
  to: number
}

export interface DaySheet {
  edges: LightEdges
  rows: DayHour[]
  /** First light to last light, the strip's span; null when the sun has no such edges this day. */
  span: { from: Date; to: Date } | null
  bands: BandSpan[]
  /** Sun height every 10 minutes across the span, for the curve. */
  curve: { t: number; altitude: number }[]
  /** The strip's top, degrees. */
  maxAltitude: number
  nowAt: number | null
  warnings: string[]
}

const usable = (d: Date | null | undefined): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** The light's edges on the venue's day, from the Sky page's own marks. */
export function lightEdges(date: string, lat: number, lon: number, timeZone: string): LightEdges {
  const from = zonedTimeToUtc(date, '00:00', timeZone)
  const next = from === null ? null : new Date(from.getTime() + 25 * HOUR)
  if (from === null || next === null) return { blueFrom: null, colorFrom: null, sunrise: null, goldenEnds: null, goldenStarts: null, sunset: null, colorTo: null, blueTo: null, noon: null }
  const end = zonedTimeToUtc(shiftDate(date, 1), '00:00', timeZone) ?? next
  const marks = sunBoundaries(from, new Date(end.getTime() - 1), lat, lon)
  const at = (kind: string) => marks.find((m) => m.kind === kind)?.at ?? null
  const noonAt = getTimes(new Date(from.getTime() + 12 * HOUR), lat, lon).solarNoon
  return {
    blueFrom: at('dawn'),
    colorFrom: at('glow'),
    sunrise: at('sunrise'),
    goldenEnds: at('day'),
    goldenStarts: at('golden'),
    sunset: at('sunset'),
    colorTo: at('blue'),
    blueTo: at('dark'),
    noon: usable(noonAt) ? { at: noonAt, altitude: getSunPosition(noonAt, lat, lon).altitude } : null,
  }
}

/** "YYYY-MM-DD" plus days, by the calendar (no clock involved). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The band a sun height is in, outside the blue stretches. */
export function bandOf(altitude: number): BandKind | null {
  if (altitude < 0) return null
  if (altitude < WARM_SIDE_DEG) return 'golden'
  if (altitude < TOP_DEG) return 'side'
  return 'top'
}

/** "Warm side", "Side · soft", "Top", "Flat". The cloud softens the word; it never decides it alone below 90%. */
export function lightWord(altitude: number, cloud: number | null): string {
  if (altitude < 0) return 'Blue'
  if (altitude < WARM_SIDE_DEG) return 'Golden'
  if (cloud !== null && cloud >= FLAT_CLOUD) return 'Flat'
  const base = altitude < SIDE_DEG ? 'Warm side' : altitude < TOP_DEG ? 'Side' : 'Top'
  return cloud !== null && cloud >= SOFT_CLOUD ? `${base} · soft` : base
}

function hourFloor(at: Date, timeZone: string): Date {
  const w = wallClock(at, timeZone)
  const secs = Math.floor(at.getTime() / MIN) * MIN
  return new Date(w === null ? Math.floor(at.getTime() / HOUR) * HOUR : secs - w.minute * MIN)
}

/** One day's sheet. */
export function daySheet(input: DayInput): DaySheet {
  const { date, lat, lon, timeZone, now, wx, fogAt } = input
  const words = input.windWords ?? ((mps: number) => `${Math.round(mps * (3600 / 1852))} kt`)
  const edges = lightEdges(date, lat, lon, timeZone)
  const first = edges.blueFrom ?? edges.sunrise
  const last = edges.blueTo ?? edges.sunset
  const alt = (t: Date) => getSunPosition(t, lat, lon).altitude
  if (!usable(first) || !usable(last) || last.getTime() <= first.getTime()) {
    return { edges, rows: [], span: null, bands: [], curve: [], maxAltitude: 0, nowAt: null, warnings: [] }
  }
  const spanFrom = first
  const spanTo = last
  const ms = (d: Date | null) => (usable(d) ? d.getTime() : null)
  const within = (t: number, a: Date | null, b: Date | null) => {
    const x = ms(a)
    const y = ms(b)
    return x !== null && y !== null && t >= x && t < y
  }
  /* The band at an instant, from the same edges the Sky page cuts its bar at. Below the horizon and outside them: blue. */
  const phaseAt = (t: number, a: number): BandKind => {
    if (within(t, edges.blueFrom, edges.colorFrom) || within(t, edges.colorTo, edges.blueTo)) return 'blue'
    if (within(t, edges.colorFrom, edges.sunrise) || within(t, edges.sunset, edges.colorTo)) return 'color'
    if (within(t, edges.sunrise, edges.goldenEnds) || within(t, edges.goldenStarts, edges.sunset)) return 'golden'
    return bandOf(a) ?? 'blue'
  }

  /* The edges that begin a window, for the row they fall in: "Blue 6:09 AM", "Color 4:50 PM". */
  const starts: { at: Date; name: string; band: BandKind }[] = []
  const edge1 = (at: Date | null, name: string, band: BandKind) => {
    if (usable(at)) starts.push({ at, name, band })
  }
  edge1(edges.blueFrom, 'Blue', 'blue')
  edge1(edges.colorFrom, 'Color', 'color')
  edge1(edges.sunrise, 'Golden', 'golden')
  edge1(edges.goldenStarts, 'Golden', 'golden')
  edge1(edges.sunset, 'Color', 'color')
  edge1(edges.colorTo, 'Blue', 'blue')
  starts.sort((a, b) => a.at.getTime() - b.at.getTime())

  const rows: DayHour[] = []
  const nowHour = hourFloor(now, timeZone).getTime()
  const wxAt = (name: DayWxName, at: Date) => (wx === null ? null : wx(name, at))
  for (let h = hourFloor(spanFrom, timeZone).getTime(); h < spanTo.getTime(); h += HOUR) {
    const start = new Date(h)
    const p = getSunPosition(start, lat, lon)
    const altitude = p.altitude
    const azimuth = p.azimuth
    /* The forecast hour is read at the half hour, the home strip's own rule, so the 4p row is the 4 to 5 o'clock hour. */
    const mid = new Date(h + 30 * MIN)
    const cloud = wxAt('cloud_cover', mid)
    const speed = wxAt('wind_speed_10m', mid)
    const dir = wxAt('wind_direction_10m', mid)
    /* Several edges can fall in one hour; the row names the last, the band the hour ends in. The strip carries the rest. */
    const edge = starts.filter((e) => e.at.getTime() > h && e.at.getTime() <= h + HOUR).pop()
    let word: string
    let band: BandKind | null
    if (edge !== undefined) {
      word = `${edge.name} ${formatClock(edge.at, timeZone)}`
      band = edge.band
    } else {
      band = phaseAt(h, altitude)
      word = band === 'blue' ? 'Blue' : band === 'color' ? 'Color' : band === 'golden' ? 'Golden' : lightWord(altitude, cloud)
    }
    rows.push({
      start,
      label: formatShortHour(start, timeZone),
      altitude,
      azimuth,
      travel: normalizeBearing(azimuth + 180),
      word,
      band,
      cloud,
      windMps: speed,
      windFrom: dir === null ? null : compassPoint(dir),
      rain: wxAt('precipitation_probability', mid),
      fog: fogAt?.(start) === true,
      current: h === nowHour,
    })
  }

  /* The strip: a band for every 5 minutes of the span, merged; the curve every 10. */
  const bands: BandSpan[] = []
  for (let t = spanFrom.getTime(); t < spanTo.getTime(); t += 5 * MIN) {
    const a = alt(new Date(t))
    const band: BandKind = phaseAt(t, a)
    const prev = bands[bands.length - 1]
    if (prev !== undefined && prev.band === band) prev.to = Math.min(t + 5 * MIN, spanTo.getTime())
    else bands.push({ band, from: t, to: Math.min(t + 5 * MIN, spanTo.getTime()) })
  }
  const curve: { t: number; altitude: number }[] = []
  for (let t = spanFrom.getTime(); t <= spanTo.getTime(); t += 10 * MIN) curve.push({ t, altitude: alt(new Date(t)) })
  const maxAltitude = Math.max(10, edges.noon?.altitude ?? 0, ...curve.map((c) => c.altitude))
  const nowMs = now.getTime()
  const nowAt = nowMs >= spanFrom.getTime() && nowMs <= spanTo.getTime() ? nowMs : null

  /* One line of warnings, from the hours as the forecast gave them. */
  const warnings: string[] = []
  const fogRows = rows.filter((r) => r.fog)
  if (fogRows.length > 0) {
    const a = fogRows[0]
    const z = fogRows[fogRows.length - 1]
    const to = new Date(z.start.getTime() + HOUR)
    warnings.push(fogRows.length === 1 ? `Fog risk is high at ${a.label}` : `Fog risk is high ${a.label}–${formatShortHour(to, timeZone)}`)
  }
  const wet = rows.find((r) => r.rain !== null && r.rain >= RAIN_WARN)
  if (wet !== undefined) warnings.push(`Rain chance ${Math.round(wet.rain ?? 0)}% at ${wet.label}`)
  const gusty = rows.find((r) => r.windMps !== null && r.windMps >= WIND_WARN_MPS)
  if (gusty !== undefined && gusty.windMps !== null) warnings.push(`Wind ${words(gusty.windMps)}${gusty.windFrom === null ? '' : ` ${gusty.windFrom}`} at ${gusty.label}`)
  return { edges, rows, span: { from: spanFrom, to: spanTo }, bands, curve, maxAltitude, nowAt, warnings }
}

/** The line under the hour rows: the warnings, or what is missing. Null when there is nothing to say. */
export function warningsLine(sheet: DaySheet, haveForecast: boolean): string | null {
  if (sheet.rows.length === 0) return null
  if (sheet.warnings.length > 0) return sheet.warnings.join(' · ')
  return haveForecast ? null : 'The forecast did not say: cloud, wind and rain are dashes'
}

/** "Sat 21 Nov", from a venue date. */
export function dayWords(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

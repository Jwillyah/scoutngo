/*
 * SKY FIRE: WILL THE CLOUDS LIGHT UP AT SUNRISE OR SUNSET. Arithmetic only.
 *
 * WHAT MAKES IT. Clouds turn red and gold when the low sun shines UNDER them
 * from below the horizon. Three things have to hold, and each is checked
 * with numbers from the forecast, model by model:
 *
 *   canvas       cloud to light: a mid or high deck overhead and toward the
 *                sun between CANVAS_MIN and CANVAS_MAX per cent; or, failing
 *                that, a low deck overhead, which is lit from underneath
 *                when the light can reach it
 *   gap          the light can get there: along the light path, where the
 *                sun's rays come in at the canvas's height, low cloud is
 *                mostly clear
 *   not blocked  no thick low deck right overhead hiding a mid or high
 *                canvas from where you stand
 *
 * WHERE THE LIGHT COMES IN. A ray that just clears the horizon and reaches
 * a deck at height h overhead grazes the Earth sqrt(2 R h) away toward the
 * sun: about 110 km for a deck at 1 km, 320 km for one at 8 km. So the gap
 * that matters for a high deck is a long way off, and for a low deck it is
 * where the deck ends. (29 Oct at the Virginia Beach pier: a low deck at
 * about 3,000 ft right overhead and 100 km out to sea, clear beyond 150 km.
 * It fired, lit from underneath.)
 *
 * NEVER CERTAIN. The words are "possible", "likely" and "unlikely", with the
 * reason and how many models agree. The forecast places cloud on a grid
 * kilometres across; it cannot promise a hole.
 */
import { destination } from '@turf/destination'
import { getTimes } from 'suncalc'
import { antiSolar, OPPOSITE_SAMPLES } from './afterglow.ts'
import type { LatLon } from './geo.ts'

export const EARTH_RADIUS_KM = 6371

/** Distances sampled toward the sun, km. 0 is overhead. */
export const PATH_KM = [0, 25, 50, 100, 150, 200, 300, 400] as const

/** The models asked, best_match first. best_match is Open-Meteo's own pick, counted apart from the five. */
export const FIRE_MODELS = ['best_match', 'gfs_hrrr', 'gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'] as const
export type FireModel = (typeof FIRE_MODELS)[number]
export const MODEL_LABEL: Record<FireModel, string> = {
  best_match: 'Best match',
  gfs_hrrr: 'HRRR',
  gfs_seamless: 'GFS',
  ecmwf_ifs025: 'ECMWF',
  icon_seamless: 'ICON',
  gem_seamless: 'GEM',
}

/** Typical deck heights, metres, when no station gives a base. */
export const DECK_HEIGHT_M = { low: 1000, mid: 4000, high: 8000 } as const
export const CANVAS_MIN = 30
export const CANVAS_MAX = 90
/** Low cloud along the light path at or under this is "mostly clear". */
export const GAP_MAX = 40
/** A low deck ends where low cloud falls to this or under. */
export const DECK_ENDS = 25
/** Low cloud overhead at or over this hides a mid or high canvas. */
export const BLOCKED_AT = 70

/** Rounded to 2 decimals (about a kilometre) before anything leaves the phone. */
export const roundCoord = (x: number): number => Math.round(x * 100) / 100

/** Where the light grazes the Earth for a deck at heightM overhead: sqrt(2 R h), km. */
export function grazingKm(heightM: number): number {
  return Math.sqrt(2 * EARTH_RADIUS_KM * (heightM / 1000))
}

/** The same, exactly: the arc to the tangent point of a circle of radius R seen from R + h. */
export function grazingKmExact(heightM: number): number {
  const h = heightM / 1000
  return EARTH_RADIUS_KM * Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + h))
}

/** The sample points toward the sun, on the sphere, rounded for sending. */
export function pathPoints(from: LatLon, azimuthDeg: number): { km: number; at: LatLon }[] {
  return PATH_KM.map((km) => {
    if (km === 0) return { km, at: { lat: roundCoord(from.lat), lon: roundCoord(from.lon) } }
    const [lon, lat] = destination([from.lon, from.lat], km, azimuthDeg, { units: 'kilometers' }).geometry.coordinates
    return { km, at: { lat: roundCoord(lat), lon: roundCoord(lon) } }
  })
}

export interface Layers {
  low: number | null
  mid: number | null
  high: number | null
}

/** One model's cover along the path at the hour: samples[i] is at PATH_KM[i]. */
export interface ModelPath {
  model: FireModel
  samples: Layers[]
  /** The opposite sky (Batch NOW, Section 0): opposite[i] is at OPPOSITE_SAMPLES[i]; absent in answers kept before it was asked. */
  opposite?: Layers[]
}

/** The opposite sky's sample points (src/core/afterglow.ts), rounded for sending as the path's. */
export function oppositePoints(from: LatLon, sunAzDeg: number): { km: number; at: LatLon }[] {
  return OPPOSITE_SAMPLES.map(({ dAz, km }) => {
    const [lon, lat] = destination([from.lon, from.lat], km, antiSolar(sunAzDeg) + dAz, { units: 'kilometers' }).geometry.coordinates
    return { km, at: { lat: roundCoord(lat), lon: roundCoord(lon) } }
  })
}

/** The spread of low cloud overhead across the five, for "models split" on the chip. */
export const SPLIT_AT = 50
export function modelsSplit(overhead: readonly (number | null)[]): boolean {
  const v = overhead.filter((x): x is number => x !== null)
  return v.length >= 2 && Math.max(...v) - Math.min(...v) >= SPLIT_AT
}

/** "Low 87 · Mid 20 · High 0", dashes for what the forecast did not say. */
export function layersLine(l: Layers): string {
  const n = (x: number | null) => (x === null ? '—' : String(Math.round(x)))
  return `Low ${n(l.low)} · Mid ${n(l.mid)} · High ${n(l.high)}`
}

/** The chip's short form, low·mid·high: "87·20·0". */
export function cloudTriple(l: Layers): string {
  const n = (x: number | null) => (x === null ? '—' : String(Math.round(x)))
  return `${n(l.low)}·${n(l.mid)}·${n(l.high)}`
}

/** The next sunrise and sunset from `at`, an hour's grace for one just past. */
export function nextEvents(at: Date, venue: LatLon): Record<'sunrise' | 'sunset', Date | null> {
  const out: Record<'sunrise' | 'sunset', Date | null> = { sunrise: null, sunset: null }
  const valid = (d: Date | null | undefined): d is Date => d instanceof Date && !Number.isNaN(d.getTime())
  for (const dayShift of [-1, 0, 1, 2]) {
    const t = getTimes(new Date(at.getTime() + dayShift * 86_400_000), venue.lat, venue.lon)
    for (const kind of ['sunrise', 'sunset'] as const) {
      const e = t[kind]
      if (out[kind] === null && valid(e) && e.getTime() > at.getTime() - 3_600_000) out[kind] = e
    }
  }
  return out
}

/*
 * WHICH EVENT THE LOG BUTTONS ARE FOR (Batch G, item 6: at 6:11 on 2 Nov there
 * was no "It fired" button anywhere, the glow already over and sunrise still
 * to come). From LOG_FROM_MIN before a sunrise or sunset, when the high cloud
 * can already be lit, to LOG_FOR_H after it; past that, the last one earlier
 * the same day where you are, so opening the app at noon still logs the
 * morning.
 */
export const LOG_FROM_MIN = 50
export const LOG_FOR_H = 3

export function eventToLog(now: Date, venue: LatLon, timeZone: string): { kind: 'sunrise' | 'sunset'; at: Date } | null {
  const valid = (d: Date | null | undefined): d is Date => d instanceof Date && !Number.isNaN(d.getTime())
  const all: { kind: 'sunrise' | 'sunset'; at: Date }[] = []
  for (const dayShift of [-1, 0, 1]) {
    const t = getTimes(new Date(now.getTime() + dayShift * 86_400_000), venue.lat, venue.lon)
    for (const kind of ['sunrise', 'sunset'] as const) if (valid(t[kind])) all.push({ kind, at: t[kind] as Date })
  }
  const seen = new Set<number>()
  const events = all.filter((e) => (seen.has(e.at.getTime()) ? false : (seen.add(e.at.getTime()), true))).sort((a, b) => b.at.getTime() - a.at.getTime())
  const t = now.getTime()
  const open = events.find((e) => t >= e.at.getTime() - LOG_FROM_MIN * 60_000 && t <= e.at.getTime() + LOG_FOR_H * 3_600_000)
  if (open !== undefined) return open
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return events.find((e) => e.at.getTime() < t && day(e.at) === day(now)) ?? null
}

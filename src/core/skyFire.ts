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
}

export interface Check {
  pass: boolean
  /** The number behind it, per cent, said in the card. */
  value: number | null
  say: string
}

export interface ModelChecks {
  model: FireModel
  canvas: Check & { deck: 'low' | 'mid' | 'high' | null }
  gap: Check
  notBlocked: Check
  fires: boolean
}

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length
}
const at = (p: ModelPath, km: number): Layers | undefined => p.samples[PATH_KM.indexOf(km as (typeof PATH_KM)[number])]
const upper = (l: Layers | undefined): number | null => {
  if (l === undefined || (l.mid === null && l.high === null)) return null
  return Math.max(l.mid ?? 0, l.high ?? 0)
}
const r0 = (x: number | null) => (x === null ? null : Math.round(x))

/** The three checks for one model. lowBaseM: the low deck's base from a station, when there is one. */
export function checkModel(p: ModelPath, lowBaseM: number | null = null): ModelChecks {
  const canvasUpper = mean([0, 25, 50].map((k) => upper(at(p, k))))
  const lowOver = mean([0, 25].map((k) => at(p, k)?.low ?? null))
  const lowRight = at(p, 0)?.low ?? null

  let deck: 'low' | 'mid' | 'high' | null = null
  if (canvasUpper !== null && canvasUpper >= CANVAS_MIN && canvasUpper <= CANVAS_MAX) {
    const over = at(p, 0)
    deck = (over?.high ?? 0) >= (over?.mid ?? 0) ? 'high' : 'mid'
  } else if (lowOver !== null && lowOver >= CANVAS_MIN) deck = 'low'

  const canvas: ModelChecks['canvas'] =
    deck === 'low'
      ? { pass: true, deck, value: r0(lowOver), say: `low deck overhead ${r0(lowOver)}%` }
      : deck !== null
        ? { pass: true, deck, value: r0(canvasUpper), say: `${deck} cloud overhead and toward the sun ${r0(canvasUpper)}%` }
        : {
            pass: false,
            deck: null,
            value: r0(canvasUpper),
            say: canvasUpper !== null && canvasUpper > CANVAS_MAX ? `mid and high cloud ${r0(canvasUpper)}%, a lid` : `mid and high cloud ${r0(canvasUpper) ?? '—'}%, nothing to light`,
          }

  /* The gap: for a low deck, where it ends; for a higher one, round where its light grazes the Earth. */
  let gap: Check
  if (deck === 'low') {
    const reach = grazingKm(lowBaseM ?? DECK_HEIGHT_M.low) * 1.5
    const ends = PATH_KM.find((k) => k > 0 && k <= reach && (at(p, k)?.low ?? 101) <= DECK_ENDS)
    gap = ends === undefined
      ? { pass: false, value: null, say: `the low deck runs on past ${Math.round(reach)} km toward the sun` }
      : { pass: true, value: at(p, ends)?.low ?? null, say: `the low deck ends ${ends} km toward the sun (${at(p, ends)?.low}% beyond)` }
  } else {
    const g = grazingKm(deck === 'mid' ? DECK_HEIGHT_M.mid : DECK_HEIGHT_M.high)
    const near = PATH_KM.filter((k) => k >= g * 0.6 && k <= g * 1.4)
    const lowPath = mean(near.map((k) => at(p, k)?.low ?? null))
    gap = lowPath === null
      ? { pass: false, value: null, say: 'no low cloud figure along the light path' }
      : { pass: lowPath <= GAP_MAX, value: r0(lowPath), say: `low cloud along the light path, ${near[0]}–${near[near.length - 1]} km, ${r0(lowPath)}%` }
  }

  const notBlocked: Check =
    deck === 'low'
      ? { pass: true, value: r0(lowRight), say: 'the low deck is the canvas' }
      : lowRight === null
        ? { pass: false, value: null, say: 'no low cloud figure overhead' }
        : { pass: lowRight < BLOCKED_AT, value: lowRight, say: `low cloud right overhead ${lowRight}%` }

  return { model: p.model, canvas, gap, notBlocked, fires: canvas.pass && gap.pass && notBlocked.pass }
}

export type FireWord = 'likely' | 'possible' | 'unlikely'

export interface FireVerdict {
  word: FireWord
  /** "Fire possible", or "Fire unlikely: no gap toward the sun". */
  line: string
  /** Of the five named models with figures, how many fire. */
  agree: number
  of: number
  checks: ModelChecks[]
}

/** The reason a forecast says no, from best_match's first failing check. */
function why(c: ModelChecks): string {
  if (!c.canvas.pass) return (c.canvas.value ?? 0) > CANVAS_MAX ? 'a lid of cloud' : 'nothing to light'
  if (!c.gap.pass) return 'no gap toward the sun'
  return 'a thick low deck overhead'
}

/**
 * The verdict across models: likely when at least 3 in 5 named models fire;
 * possible when 2 do, or best_match does; else unlikely, with the reason.
 */
export function fireVerdict(paths: readonly ModelPath[], lowBaseM: number | null = null): FireVerdict | null {
  const checks = paths.map((p) => checkModel(p, lowBaseM))
  const named = checks.filter((c) => c.model !== 'best_match' && c.canvas.value !== null)
  const best = checks.find((c) => c.model === 'best_match') ?? checks[0]
  if (best === undefined || named.length === 0) return null
  const agree = named.filter((c) => c.fires).length
  const of = named.length
  const word: FireWord = agree / of >= 0.6 ? 'likely' : agree >= 2 || best.fires ? 'possible' : 'unlikely'
  const line = word === 'unlikely' ? `Fire unlikely: ${why(best)}` : `Fire ${word}`
  return { word, line, agree, of, checks }
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

/*
 * WHEN TO LOOK. A high deck stays lit until the sun is about 3 degrees below
 * the horizon, a low one about 1 degree: so at sunrise the colour often
 * comes BEFORE the sun, and at sunset it lasts after it.
 */
export const LIT_UNTIL_DEG = { low: -1, mid: -2, high: -3 } as const

/** When the sun's altitude crosses `deg` near an event, by bisection: rising before a sunrise, setting after a sunset. */
export function sunCrosses(event: Date, kind: 'sunrise' | 'sunset', deg: number, lat: number, lon: number, altitudeAt: (t: Date, lat: number, lon: number) => number): Date {
  const span = 90 * 60_000
  let a = kind === 'sunrise' ? event.getTime() - span : event.getTime()
  let b = kind === 'sunrise' ? event.getTime() : event.getTime() + span
  for (let i = 0; i < 40; i += 1) {
    const m = (a + b) / 2
    const above = altitudeAt(new Date(m), lat, lon) > deg
    if (kind === 'sunrise' ? above : !above) b = m
    else a = m
  }
  return new Date((a + b) / 2)
}

/** From when to when to watch, for the deck that would be lit. */
export function fireWindow(event: Date, kind: 'sunrise' | 'sunset', deck: 'low' | 'mid' | 'high', lat: number, lon: number, altitudeAt: (t: Date, lat: number, lon: number) => number): { from: Date; to: Date } {
  const lit = sunCrosses(event, kind, LIT_UNTIL_DEG[deck], lat, lon, altitudeAt)
  const tenMin = 10 * 60_000
  return kind === 'sunrise' ? { from: lit, to: new Date(event.getTime() + tenMin) } : { from: new Date(event.getTime() - tenMin), to: lit }
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

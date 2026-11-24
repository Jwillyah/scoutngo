/*
 * RAIN NOW, PER SPOT (Batch SIMPLE-3, Section 1b). Code decides.
 *
 * WHY. 23 Nov at 11:14 PM The Weather Channel said "intermittent rain ends
 * in the next hour, light"; our home said "Clouds coming and going ·
 * 60–100%" and nothing about rain anywhere.
 *
 * THREE READS, in this order of trust:
 *
 *   stations   a METAR within NEAR_KM (15 mi), its newest report under
 *              STATION_MAX_AGE_MS (75 min) old, with rain, drizzle or showers
 *              in its present weather (RA, DZ, SH; VCSH is showers nearby)
 *   radar      the composite the app already reads (Iowa State's N0Q, src/
 *              lib/stormData.ts) sampled at the spot and UPSTREAM_KM (10 mi)
 *              up the storm motion (radarSample below, over the same Grid);
 *              rain on radar is RAIN_DBZ or more (src/core/stormCells.ts)
 *   minutely   Open-Meteo's minutely_15 precipitation for the next 2 hours
 *              (the brief's own request, src/lib/tideSheetData.ts), each
 *              value the sum of the 15 minutes before its time
 *
 * WHAT IT SAYS. "Light rain now · ends ~11:50 PM" (raining at the spot: a
 * station or the radar; the end from the minutely series, else "ends by"
 * the time the radar's upstream gap reaches the spot), "Rain starts ~2:15
 * PM · light" (the minutely series, else the radar's upstream rain carried
 * down the motion), "Showers nearby · moving NE" (rain within 15 mi that is
 * neither here nor upstream). Times are rounded to 5 minutes and written by
 * formatClock. Nothing to say: null. Nothing read at all: "unknown", never
 * "dry".
 *
 * Intensity, by the AMS rate bands: light under 2.5 mm/h, moderate to 7.6,
 * heavy above. A station's "-" or "+" says it; the radar's dBZ by
 * Marshall-Palmer (Z = 200 R^1.6): 2.5 mm/h is 30 dBZ, 7.6 is 38 dBZ.
 *
 * Pure: samples in, words out. The phone samples the radar it already
 * fetched (radarSample over stormData's Grid and Radar.tracks).
 */
import { destinationPoint, type LatLon } from './geo.ts'
import { compassPoint } from './field.ts'
import { latLonPixel, nearestEcho, RAIN_DBZ, type Grid, type Track } from './stormCells.ts'
import { formatClock } from './timezone.ts'

/** 15 miles. */
export const NEAR_KM = 24.14
/** 10 miles. */
export const UPSTREAM_KM = 16.09
export const STATION_MAX_AGE_MS = 75 * 60_000
export const STATION_AHEAD_MS = 10 * 60_000
/** A radar scan older than this says nothing about now. */
export const RADAR_MAX_AGE_MS = 20 * 60_000
export const AHEAD_MS = 2 * 3_600_000
export const QUARTER_MS = 15 * 60_000
/** mm/h. */
export const LIGHT_MMH = 2.5
export const MODERATE_MMH = 7.6
/** Marshall-Palmer dBZ for those rates. */
export const LIGHT_DBZ = 30
export const MODERATE_DBZ = 38
/** Under this km/h the rain is not moving: no arrival, no "moving". */
export const STILL_KMH = 5

export type Intensity = 'light' | 'moderate' | 'heavy'

export interface RainStation {
  id: string
  km: number
  at: Date
  /** Present-weather tokens ("-RA BR", "VCSH"), null when none (src/core/fogRisk.ts metarWeather reads them from a METAR). */
  wx: string | null
}

export interface RadarSample {
  /** The scan's time. */
  at: Date
  /** dBZ at the spot (the most within a pixel round it); null: no echo. */
  spotDbz: number | null
  /** dBZ UPSTREAM_KM up the motion; null: no echo, or no motion known. */
  upstreamDbz: number | null
  /** The nearest echo of RAIN_DBZ or more. */
  nearest: { km: number; bearingDeg: number } | null
  /** Where the rain is going and how fast; null when unknown or still. */
  motion: { towardDeg: number; kmh: number } | null
}

export interface QuarterIn {
  /** The END of the 15 minutes (Open-Meteo's minutely_15 time). */
  at: Date
  mm: number | null
}

export interface RainNowIn {
  now: Date
  stations: readonly RainStation[]
  radar: RadarSample | null
  /** Open-Meteo minutely_15 precipitation; any span, the next 2 hours are read. */
  quarters: readonly QuarterIn[]
}

export interface RainBar {
  from: Date
  to: Date
  /** mm in the 15 minutes; null where the forecast said nothing. */
  mm: number | null
  intensity: Intensity | null
}

export type RainState = 'raining' | 'starting' | 'nearby' | 'dry' | 'unknown'

export interface RainNow {
  state: RainState
  intensity: Intensity | null
  /** When it starts ('starting'), rounded to 5 min. */
  startsAt: Date | null
  /** When it ends ('raining'): `endsBy` true when this is the latest it should end (the radar's gap), not the forecast's own end. */
  endsAt: Date | null
  endsBy: boolean
  /** Where the rain is going, degrees. */
  movingTowardDeg: number | null
  /** The next 2 hours in 15 minutes: 8 bars, for the strip. */
  bars: RainBar[]
  /** What decided it, in words: "KORF -RA 11:36 PM", "radar 34 dBZ at the spot", "forecast 0.3 mm by 2:15 PM". */
  by: string[]
}

/* ---------------------------------------------------------------- radar */

/** dBZ at a point on the grid: the most of the pixel and its eight round it; null with no echo. */
export function dbzAt(g: Grid, at: LatLon): number | null {
  const p = latLonPixel(g.zoom, at)
  const x = Math.floor(p.gx - g.px0)
  const y = Math.floor(p.gy - g.py0)
  let most = -Infinity
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue
      const d = g.dbz[ny * g.w + nx]
      if (d > most) most = d
    }
  }
  return Number.isFinite(most) ? most : null
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** The rain's motion from the tracked cells (their own matches, not the borrowed): the median, or null when there are none or it is still. */
export function radarMotion(tracks: readonly Track[]): { towardDeg: number; kmh: number } | null {
  const v = tracks.filter((t) => t.v !== null && !t.borrowed).map((t) => t.v as { e: number; n: number })
  if (v.length === 0) return null
  const e = median(v.map((x) => x.e))
  const n = median(v.map((x) => x.n))
  const kmh = Math.hypot(e, n)
  return kmh < STILL_KMH ? null : { towardDeg: ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360, kmh }
}

/**
 * The radar read for the nowcast: the spot, UPSTREAM_KM up the motion, the
 * nearest rain. `grid` is the newest scan (src/lib/stormData.ts fetchGrid),
 * `tracks` the cells tracked over the last scans (Radar.tracks).
 */
export function radarSample(grid: Grid, spot: LatLon, scanAt: Date, tracks: readonly Track[]): RadarSample {
  const motion = radarMotion(tracks)
  const up = motion === null ? null : destinationPoint(spot, (motion.towardDeg + 180) % 360, UPSTREAM_KM * 1000)
  return { at: scanAt, spotDbz: dbzAt(grid, spot), upstreamDbz: up === null ? null : dbzAt(grid, up), nearest: nearestEcho(grid, spot, RAIN_DBZ), motion }
}

/* ------------------------------------------------------------- the call */

const toks = (wx: string | null) => (wx === null ? [] : wx.split(/\s+/))
const WET = /^([-+]?)(SH|TS)?(RA|DZ)+$|^([-+]?)SH$/
const VCSH = /^VC(SH|TS)$/

function stationIntensity(t: string): Intensity {
  return t.startsWith('-') ? 'light' : t.startsWith('+') ? 'heavy' : 'moderate'
}
export const mmhIntensity = (mmh: number): Intensity => (mmh < LIGHT_MMH ? 'light' : mmh <= MODERATE_MMH ? 'moderate' : 'heavy')
export const dbzIntensity = (dbz: number): Intensity => (dbz < LIGHT_DBZ ? 'light' : dbz <= MODERATE_DBZ ? 'moderate' : 'heavy')

/** Rounded to the nearest 5 minutes. */
const five = (t: number) => new Date(Math.round(t / 300_000) * 300_000)

/** The next 2 hours in 15-minute bars: the minutely_15 values whose 15 minutes end after now. */
export function rainBars(quarters: readonly QuarterIn[], now: Date): RainBar[] {
  const t = now.getTime()
  return quarters
    .filter((q) => q.at.getTime() > t && q.at.getTime() - QUARTER_MS < t + AHEAD_MS)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, AHEAD_MS / QUARTER_MS)
    .map((q) => ({ from: new Date(q.at.getTime() - QUARTER_MS), to: q.at, mm: q.mm, intensity: q.mm === null || q.mm <= 0 ? null : mmhIntensity(q.mm * 4) }))
}

/** Where the rain stands at the spot now, from the stations, the radar and the minutely forecast. */
export function rainNow(i: RainNowIn): RainNow {
  const t = i.now.getTime()
  const by: string[] = []
  const bars = rainBars(i.quarters, i.now)
  const wetBars = bars.filter((b) => b.mm !== null && b.mm > 0)

  /* Each station's newest report, fresh and within 15 mi. */
  const newest = new Map<string, RainStation>()
  for (const s of i.stations) {
    const age = t - s.at.getTime()
    if (s.km > NEAR_KM || age > STATION_MAX_AGE_MS || age < -STATION_AHEAD_MS) continue
    const had = newest.get(s.id)
    if (had === undefined || s.at.getTime() > had.at.getTime()) newest.set(s.id, s)
  }
  const fresh = [...newest.values()].sort((a, b) => a.km - b.km)
  const wetAt = fresh.map((s) => ({ s, tok: toks(s.wx).find((x) => WET.test(x)) ?? null })).filter((x) => x.tok !== null)
  const vicinity = fresh.find((s) => toks(s.wx).some((x) => VCSH.test(x))) ?? null

  const radar = i.radar !== null && t - i.radar.at.getTime() <= RADAR_MAX_AGE_MS && i.radar.at.getTime() - t <= STATION_AHEAD_MS ? i.radar : null
  const radarHere = radar?.spotDbz != null && radar.spotDbz >= RAIN_DBZ ? radar.spotDbz : null
  const radarUp = radar?.upstreamDbz != null && radar.upstreamDbz >= RAIN_DBZ ? radar.upstreamDbz : null
  const moving = radar?.motion ?? null

  const known = fresh.length > 0 || radar !== null || bars.some((b) => b.mm !== null)
  const base = { movingTowardDeg: moving?.towardDeg ?? null, bars, by }
  if (!known) return { ...base, state: 'unknown', intensity: null, startsAt: null, endsAt: null, endsBy: false }

  /* Raining now: the nearest station that says so, or the radar over the spot. */
  const st = wetAt[0] ?? null
  if (st !== null || radarHere !== null) {
    if (st !== null) by.push(`${st.s.id} ${st.tok}`)
    if (radarHere !== null) by.push(`radar ${Math.round(radarHere)} dBZ at the spot`)
    const intensity = st !== null ? stationIntensity(st.tok as string) : dbzIntensity(radarHere as number)
    /* The end: the first dry 15 minutes in the forecast after a wet one now; else the radar's gap upstream reaching the spot. */
    let endsAt: Date | null = null
    let endsBy = false
    const firstDry = bars.findIndex((b) => b.mm !== null && b.mm <= 0)
    if (wetBars.length > 0 && firstDry > 0 && bars.slice(0, firstDry).every((b) => b.mm !== null && b.mm > 0)) {
      endsAt = five(bars[firstDry].from.getTime())
      by.push('forecast dry from then')
    } else if (radar !== null && moving !== null && radarUp === null) {
      endsAt = five(t + (UPSTREAM_KM / moving.kmh) * 3_600_000)
      endsBy = true
      by.push(`radar dry ${Math.round(UPSTREAM_KM / 1.609)} mi upstream`)
    }
    return { ...base, state: 'raining', intensity, startsAt: null, endsAt, endsBy }
  }

  /* Starting: the forecast's first wet 15 minutes; else the radar's upstream rain carried down the motion. */
  if (wetBars.length > 0) {
    const first = wetBars[0]
    const peak = Math.max(...wetBars.map((b) => b.mm as number))
    by.push(`forecast ${first.mm} mm in a quarter hour`)
    return { ...base, state: 'starting', intensity: mmhIntensity(peak * 4), startsAt: five(first.from.getTime()), endsAt: null, endsBy: false }
  }
  if (radarUp !== null && moving !== null) {
    const km = radar?.nearest != null && radar.nearest.km < UPSTREAM_KM ? radar.nearest.km : UPSTREAM_KM
    by.push(`radar ${Math.round(radarUp)} dBZ ${Math.round(UPSTREAM_KM / 1.609)} mi upstream`)
    return { ...base, state: 'starting', intensity: dbzIntensity(radarUp), startsAt: five(t + (km / moving.kmh) * 3_600_000), endsAt: null, endsBy: false }
  }

  /* Nearby: rain within 15 mi that is neither here nor upstream. */
  const near = radar?.nearest != null && radar.nearest.km <= NEAR_KM ? radar.nearest : null
  if (near !== null || vicinity !== null) {
    if (near !== null) by.push(`radar rain ${Math.round(near.km / 1.609)} mi ${compassPoint(near.bearingDeg)}`)
    if (vicinity !== null) by.push(`${vicinity.id} VCSH`)
    return { ...base, state: 'nearby', intensity: null, startsAt: null, endsAt: null, endsBy: false }
  }
  return { ...base, state: 'dry', intensity: null, startsAt: null, endsAt: null, endsBy: false }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Light rain now · ends ~11:50 PM", "Rain starts ~2:15 PM · light", "Showers nearby · moving NE"; null when dry or unknown. */
export function rainPhrase(r: RainNow, timeZone: string): string | null {
  if (r.state === 'raining') {
    const what = `${cap(r.intensity ?? 'light')} rain now`
    return r.endsAt === null ? what : `${what} · ends ${r.endsBy ? 'by ' : ''}~${formatClock(r.endsAt, timeZone)}`
  }
  if (r.state === 'starting' && r.startsAt !== null) return `Rain starts ~${formatClock(r.startsAt, timeZone)}${r.intensity === null ? '' : ` · ${r.intensity}`}`
  if (r.state === 'nearby') return `Showers nearby${r.movingTowardDeg === null ? '' : ` · moving ${compassPoint(r.movingTowardDeg)}`}`
  return null
}

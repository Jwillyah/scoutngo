/*
 * THE FIGURES BEHIND SKY FIRE, fetched. Arithmetic is src/core/skyFire.ts.
 *
 * WHAT LEAVES THE PHONE. To Open-Meteo: eight points along the sun's line
 * and two on the opposite sky (Batch NOW, Section 0: the afterglow), each
 * rounded to 2 decimals (about a kilometre), and a date. To
 * api.weather.gov, only in the two hours before the event: the venue rounded
 * the same way, to find the nearest stations, then station ids. To this
 * app's /api/metar, only when weather.gov gives no METAR text: a station id.
 * No key, nothing stored server-side.
 */
import { OPPOSITE_SAMPLES } from '../core/afterglow.ts'
import { FIRE_MODELS, oppositePoints, PATH_KM, pathPoints, roundCoord, type FireModel, type Layers, type ModelPath } from '../core/skyFire.ts'
import { parseMetarSky, type MetarSky } from '../core/metar.ts'
import type { LatLon } from '../core/geo.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { FORECAST_MAX_AGE_MS, SLOW_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

export interface FirePaths {
  /** ISO hours, UTC, "2026-10-29T11:00". */
  hours: string[]
  /** paths[model][hourIndex] */
  byModel: Partial<Record<FireModel, ModelPath[]>>
  /** When the answer arrived, and whether it is the last good one because no new one could be had. */
  fetchedAt?: number
  stale?: boolean
}

/** One event's points: the sun's line, then the opposite sky. */
const linePoints = (from: LatLon, azimuthDeg: number) => [...pathPoints(from, azimuthDeg), ...oppositePoints(from, azimuthDeg)]
/** Points in one event's answer. */
export const LINE_POINTS = PATH_KM.length + OPPOSITE_SAMPLES.length

export function firePathsUrl(from: LatLon, azimuthDeg: number, date: string): string {
  const pts = linePoints(from, azimuthDeg)
  const params = new URLSearchParams({
    latitude: pts.map((p) => p.at.lat.toFixed(2)).join(','),
    longitude: pts.map((p) => p.at.lon.toFixed(2)).join(','),
    hourly: 'cloud_cover_low,cloud_cover_mid,cloud_cover_high',
    models: FIRE_MODELS.join(','),
    start_date: date,
    end_date: date,
    timezone: 'GMT',
  })
  return `${OPEN_METEO_URL}?${params.toString()}`
}

/*
 * A WEEK OF ONE EVENT IN ONE QUESTION (Batch H, the briefing's This week):
 * the same eight points along the sun's line, for several days. The sun's
 * bearing at an event moves about a degree a week in November, so the
 * middle day's line stands for the run; Today and Tomorrow are asked the
 * Sky fire page's own way (firePathsUrl), so they read the same verdict.
 */
export function firePathsRangeUrl(from: LatLon, azimuthDeg: number, startDate: string, endDate: string): string {
  const u = new URL(firePathsUrl(from, azimuthDeg, startDate))
  u.searchParams.set('end_date', endDate)
  return u.toString()
}

export async function fetchFirePathsRange(from: LatLon, azimuthDeg: number, startDate: string, endDate: string, fetchImpl: typeof fetch = fetch): Promise<FirePaths | null> {
  const got = await weatherJson(firePathsRangeUrl(from, azimuthDeg, startDate, endDate), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS * 2 })
  if (!got.ok) return null
  const paths = parseFirePaths(got.payload)
  return paths === null ? null : { ...paths, fetchedAt: got.fetchedAt, stale: got.stale }
}

/*
 * SUNRISE AND SUNSET, THE WEEK, IN ONE QUESTION (Batch M, Section 1). The
 * home asked six: each event for today, for tomorrow and for the rest of the
 * week, each on its own day's line, so each was a new 8-point request (14.4
 * of Open-Meteo's calls apiece, about 86 an open; measurements/
 * 2026-11-08-cellular.md). Now one 16-point request: the sunrise line's
 * eight points then the sunset line's, each on tomorrow's bearing (it moves
 * about a degree in two days in November), the week's dates.
 */
export function firePathsBothUrl(from: LatLon, riseAzDeg: number, setAzDeg: number, startDate: string, endDate: string): string {
  const pts = [...linePoints(from, riseAzDeg), ...linePoints(from, setAzDeg)]
  const u = new URL(firePathsUrl(from, riseAzDeg, startDate))
  u.searchParams.set('latitude', pts.map((p) => p.at.lat.toFixed(2)).join(','))
  u.searchParams.set('longitude', pts.map((p) => p.at.lon.toFixed(2)).join(','))
  u.searchParams.set('end_date', endDate)
  return u.toString()
}

/** The two halves of the 16-point answer, each parsed as its own path. */
export function splitBoth(payload: unknown): { sunrise: FirePaths | null; sunset: FirePaths | null } {
  /* Answers kept from before the opposite sky was asked have the eight path points a line. */
  const n = Array.isArray(payload) && payload.length === 2 * LINE_POINTS ? LINE_POINTS : PATH_KM.length
  if (!Array.isArray(payload) || payload.length !== 2 * n) return { sunrise: null, sunset: null }
  return { sunrise: parseFirePaths(payload.slice(0, n)), sunset: parseFirePaths(payload.slice(n)) }
}

export async function fetchFirePathsBoth(from: LatLon, riseAzDeg: number, setAzDeg: number, startDate: string, endDate: string): Promise<{ sunrise: FirePaths | null; sunset: FirePaths | null }> {
  const got = await weatherJson(firePathsBothUrl(from, riseAzDeg, setAzDeg, startDate, endDate), { maxAgeMs: FORECAST_MAX_AGE_MS, timeoutMs: TIMEOUT_MS * 2 })
  if (!got.ok) return { sunrise: null, sunset: null }
  const both = splitBoth(got.payload)
  const stamp = (p: FirePaths | null) => (p === null ? null : { ...p, fetchedAt: got.fetchedAt, stale: got.stale })
  return { sunrise: stamp(both.sunrise), sunset: stamp(both.sunset) }
}

type Hourly = Record<string, (number | null)[] | string[] | undefined> & { time?: string[] }

/** Open-Meteo's answer for many points and models, as one path per model per hour. Tolerant: a bad payload is null. */
export function parseFirePaths(payload: unknown): FirePaths | null {
  const locations = Array.isArray(payload) ? payload : [payload]
  if (locations.length !== PATH_KM.length && locations.length !== LINE_POINTS) return null
  const hourly = locations.map((l) => (l as { hourly?: Hourly }).hourly)
  const hours = hourly[0]?.time
  if (!Array.isArray(hours) || hourly.some((h) => h === undefined)) return null
  const byModel: FirePaths['byModel'] = {}
  for (const model of FIRE_MODELS) {
    const read = (h: Hourly, v: string, i: number): number | null => {
      const series = h[`${v}_${model}`] as (number | null)[] | undefined
      const x = series?.[i]
      return typeof x === 'number' && Number.isFinite(x) ? x : null
    }
    const layers = (h: Hourly, i: number): Layers => ({ low: read(h, 'cloud_cover_low', i), mid: read(h, 'cloud_cover_mid', i), high: read(h, 'cloud_cover_high', i) })
    const paths: ModelPath[] = hours.map((_, i) => {
      const samples = hourly.slice(0, PATH_KM.length).map((h) => layers(h as Hourly, i))
      return hourly.length === LINE_POINTS ? { model, samples, opposite: hourly.slice(PATH_KM.length).map((h) => layers(h as Hourly, i)) } : { model, samples }
    })
    if (paths.some((p) => p.samples.some((s) => s.low !== null))) byModel[model] = paths
  }
  return { hours: hours as string[], byModel }
}

/** Every model's path at one hour. */
export function pathsAt(data: FirePaths, hour: string): ModelPath[] {
  const i = data.hours.indexOf(hour)
  if (i < 0) return []
  return FIRE_MODELS.flatMap((m) => {
    const p = data.byModel[m]?.[i]
    return p === undefined ? [] : [p]
  })
}

/** The forecast hour nearest an instant, as Open-Meteo writes it in GMT. */
export function nearestHour(t: Date): string {
  const d = new Date(Math.round(t.getTime() / 3_600_000) * 3_600_000)
  return d.toISOString().slice(0, 13) + ':00'
}

/** Through the shared store (src/lib/weatherStore.ts): Fire, Preview and Special ask this same question once between them. */
export async function fetchFirePaths(from: LatLon, azimuthDeg: number, date: string, fetchImpl: typeof fetch = fetch): Promise<FirePaths | null> {
  const got = await weatherJson(firePathsUrl(from, azimuthDeg, date), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS })
  if (!got.ok) return null
  const paths = parseFirePaths(got.payload)
  return paths === null ? null : { ...paths, fetchedAt: got.fetchedAt, stale: got.stale }
}

/* ---------------------------------------------------------------- aerosol */

/*
 * HOW HAZY: the aerosol optical depth at 550 nm for the event's hour, from
 * Open-Meteo's air-quality service (no key). The venue rounded to 2 decimals,
 * as for the path. For the colour clock (src/core/skyColour.ts).
 */
export const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

export function aerosolUrl(at: LatLon, event: Date): string {
  const date = event.toISOString().slice(0, 10)
  const params = new URLSearchParams({
    latitude: roundCoord(at.lat).toFixed(2),
    longitude: roundCoord(at.lon).toFixed(2),
    hourly: 'aerosol_optical_depth',
    start_date: date,
    end_date: date,
    timezone: 'GMT',
  })
  return `${AIR_QUALITY_URL}?${params.toString()}`
}

/** The value for the hour nearest the event, or null. */
export function parseAerosol(payload: unknown, event: Date): number | null {
  const hourly = (payload as { hourly?: { time?: unknown; aerosol_optical_depth?: unknown } } | null)?.hourly
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly?.aerosol_optical_depth)) return null
  const i = (hourly.time as string[]).indexOf(nearestHour(event))
  const v = i < 0 ? null : (hourly.aerosol_optical_depth as unknown[])[i]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

export async function fetchAerosol(at: LatLon, event: Date, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const got = await weatherJson(aerosolUrl(at, event), { maxAgeMs: SLOW_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS })
  return got.ok ? parseAerosol(got.payload, event) : null
}

/* --------------------------------------------------------------- stations */

export const METAR_ENDPOINT = '/api/metar'
const NWS = 'https://api.weather.gov'
const NWS_HEADERS = { accept: 'application/geo+json' }

export interface StationSky {
  sky: MetarSky
  at: string
  /** The METAR as the station sent it, for its other groups (the wind, on the Wind page). */
  raw: string
}

/** The nearest stations' latest skies, nearest first: weather.gov's METAR text, else /api/metar's. */
export async function fetchStationSkies(venue: LatLon, fetchImpl: typeof fetch = fetch, count = 2): Promise<StationSky[]> {
  try {
    const point = await fetchImpl(`${NWS}/points/${roundCoord(venue.lat).toFixed(2)},${roundCoord(venue.lon).toFixed(2)}`, { headers: NWS_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!point.ok) return []
    const stationsUrl = ((await point.json()) as { properties?: { observationStations?: string } }).properties?.observationStations
    if (typeof stationsUrl !== 'string' || !stationsUrl.startsWith(`${NWS}/`)) return []
    const list = await fetchImpl(stationsUrl, { headers: NWS_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!list.ok) return []
    const ids = (((await list.json()) as { features?: { properties?: { stationIdentifier?: string } }[] }).features ?? [])
      .map((f) => f.properties?.stationIdentifier)
      .filter((id): id is string => typeof id === 'string' && /^[A-Z0-9]{4}$/.test(id))
      .slice(0, count)
    const out: StationSky[] = []
    for (const id of ids) {
      const sky = await stationSky(id, fetchImpl)
      if (sky !== null) out.push(sky)
    }
    return out
  } catch {
    return []
  }
}

export async function stationSky(id: string, fetchImpl: typeof fetch = fetch): Promise<StationSky | null> {
  try {
    const r = await fetchImpl(`${NWS}/stations/${id}/observations/latest`, { headers: NWS_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (r.ok) {
      const p = ((await r.json()) as { properties?: { rawMessage?: string; timestamp?: string } }).properties
      const sky = typeof p?.rawMessage === 'string' ? parseMetarSky(p.rawMessage) : null
      if (sky !== null) return { sky, at: p?.timestamp ?? '', raw: p?.rawMessage ?? '' }
    }
    /* weather.gov had no METAR text for it: ask this app's function, which reads aviationweather.gov. */
    const m = await fetchImpl(METAR_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ station: id }), signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!m.ok) return null
    const body = (await m.json()) as { metar?: string; at?: string }
    const sky = typeof body.metar === 'string' ? parseMetarSky(body.metar) : null
    return sky === null ? null : { sky, at: body.at ?? '', raw: body.metar ?? '' }
  } catch {
    return null
  }
}

/* ------------------------------------------------------- the chip's split */

/**
 * Low cloud overhead from the five named models, for every hour of a day:
 * the chip says "models split" when they are far apart. One point, the venue
 * rounded to 2 decimals.
 */
export async function fetchModelLows(venue: LatLon, date: string, fetchImpl: typeof fetch = fetch): Promise<{ hours: string[]; lows: (number | null)[][] } | null> {
  const models = FIRE_MODELS.filter((m) => m !== 'best_match')
  const params = new URLSearchParams({
    latitude: roundCoord(venue.lat).toFixed(2),
    longitude: roundCoord(venue.lon).toFixed(2),
    hourly: 'cloud_cover_low',
    models: models.join(','),
    start_date: date,
    end_date: date,
    timezone: 'GMT',
  })
  try {
    const got = await weatherJson(`${OPEN_METEO_URL}?${params.toString()}`, { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS })
    if (!got.ok) return null
    const h = (got.payload as { hourly?: Record<string, unknown> }).hourly
    const hours = h?.time
    if (!Array.isArray(hours)) return null
    const lows = (hours as string[]).map((_, i) => models.map((m) => {
      const v = (h?.[`cloud_cover_low_${m}`] as (number | null)[] | undefined)?.[i]
      return typeof v === 'number' ? v : null
    }))
    return { hours: hours as string[], lows }
  } catch {
    return null
  }
}

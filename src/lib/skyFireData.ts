/*
 * THE FIGURES BEHIND SKY FIRE, fetched. Arithmetic is src/core/skyFire.ts.
 *
 * WHAT LEAVES THE PHONE. To Open-Meteo: eight points along the sun's line,
 * each rounded to 2 decimals (about a kilometre), and a date. To
 * api.weather.gov, only in the two hours before the event: the venue rounded
 * the same way, to find the nearest stations, then station ids. To this
 * app's /api/metar, only when weather.gov gives no METAR text: a station id.
 * No key, nothing stored server-side.
 */
import { FIRE_MODELS, PATH_KM, pathPoints, roundCoord, type FireModel, type Layers, type ModelPath } from '../core/skyFire.ts'
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

export function firePathsUrl(from: LatLon, azimuthDeg: number, date: string): string {
  const pts = pathPoints(from, azimuthDeg)
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

type Hourly = Record<string, (number | null)[] | string[] | undefined> & { time?: string[] }

/** Open-Meteo's answer for many points and models, as one path per model per hour. Tolerant: a bad payload is null. */
export function parseFirePaths(payload: unknown): FirePaths | null {
  const locations = Array.isArray(payload) ? payload : [payload]
  if (locations.length !== PATH_KM.length) return null
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
    const paths: ModelPath[] = hours.map((_, i) => ({
      model,
      samples: hourly.map((h): Layers => ({ low: read(h as Hourly, 'cloud_cover_low', i), mid: read(h as Hourly, 'cloud_cover_mid', i), high: read(h as Hourly, 'cloud_cover_high', i) })),
    }))
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

async function stationSky(id: string, fetchImpl: typeof fetch): Promise<StationSky | null> {
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

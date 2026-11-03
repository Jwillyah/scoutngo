/*
 * HOW VIVID, FETCHED (Batch J, Section 4). Arithmetic is src/core/vivid.ts.
 *
 * WHAT LEAVES THE PHONE.
 *   Open-Meteo air quality    the venue to 2 decimals and a date
 *   Open-Meteo                the venue and four points 60 km round it, to 2
 *                             decimals: the last 6 hours' rain
 *   Open-Meteo ensemble       the eight points along the sun's line Sky fire
 *                             already asks, to 2 decimals, and a date
 *   api.weather.gov           the venue to 2 decimals (its forecast office),
 *                             then that office's latest discussion
 */
import { destinationPoint, type LatLon } from '../core/geo.ts'
import { pathPoints, roundCoord } from '../core/skyFire.ts'
import type { RunPath } from '../core/vivid.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { AIR_QUALITY_URL, nearestHour } from './skyFireData.ts'
import { FORECAST_MAX_AGE_MS, SLOW_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

export const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const NWS = 'https://api.weather.gov'
const r2 = (x: number) => roundCoord(x).toFixed(2)

/* ------------------------------------------------------------------ air */

export const airUrl = (at: LatLon, date: string): string =>
  `${AIR_QUALITY_URL}?${new URLSearchParams({ latitude: r2(at.lat), longitude: r2(at.lon), hourly: 'aerosol_optical_depth,dust,pm2_5', start_date: date, end_date: date, timezone: 'GMT' }).toString()}`

export function parseAir(payload: unknown, at: Date): { aod: number | null; dust: number | null; pm25: number | null } | null {
  const h = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  if (!Array.isArray(h?.time)) return null
  const i = (h.time as string[]).indexOf(nearestHour(at))
  const v = (k: string) => {
    const x = (h[k] as unknown[] | undefined)?.[i]
    return typeof x === 'number' && Number.isFinite(x) ? x : null
  }
  return i < 0 ? null : { aod: v('aerosol_optical_depth'), dust: v('dust'), pm25: v('pm2_5') }
}

export async function fetchAir(at: LatLon, event: Date, fetchImpl: typeof fetch = fetch) {
  const got = await weatherJson(airUrl(at, event.toISOString().slice(0, 10)), { maxAgeMs: SLOW_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS })
  return got.ok ? parseAir(got.payload, event) : null
}

/* ----------------------------------------------------------------- rain */

/** The venue and four points 60 km north, east, south and west. */
export function rainPoints(at: LatLon): LatLon[] {
  return [at, ...[0, 90, 180, 270].map((b) => destinationPoint(at, b, 60_000))]
}

export const rainUrl = (at: LatLon): string => {
  const pts = rainPoints(at)
  return `${OPEN_METEO_URL}?${new URLSearchParams({ latitude: pts.map((p) => r2(p.lat)).join(','), longitude: pts.map((p) => r2(p.lon)).join(','), hourly: 'precipitation,wind_direction_10m', past_days: '1', forecast_days: '1', timezone: 'GMT' }).toString()}`
}

/** Rain in the 6 hours before `now` at the venue or the point upwind of it, mm (the more of the two). */
export function parseRecentRain(payload: unknown, now: Date): number | null {
  const locs = Array.isArray(payload) ? payload : [payload]
  if (locs.length !== 5) return null
  const hourly = locs.map((l) => (l as { hourly?: { time?: string[]; precipitation?: (number | null)[]; wind_direction_10m?: (number | null)[] } }).hourly)
  const times = hourly[0]?.time
  if (!Array.isArray(times)) return null
  const end = times.indexOf(nearestHour(now))
  if (end < 0) return null
  const sum = (k: number) => (hourly[k]?.precipitation ?? []).slice(Math.max(0, end - 5), end + 1).reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0)
  const from = hourly[0]?.wind_direction_10m?.[end]
  /* The point nearest where the wind comes from: N, E, S, W. */
  const up = typeof from === 'number' ? 1 + (Math.round(((from % 360) + 360) % 360 / 90) % 4) : null
  return Math.max(sum(0), up === null ? 0 : sum(up))
}

export async function fetchRecentRain(at: LatLon, now: Date, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const got = await weatherJson(rainUrl(at), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS })
  return got.ok ? parseRecentRain(got.payload, now) : null
}

/* -------------------------------------------------------------- ensemble */

export const ensembleUrl = (at: LatLon, azimuthDeg: number, date: string): string => {
  const pts = pathPoints(at, azimuthDeg)
  return `${ENSEMBLE_URL}?${new URLSearchParams({ latitude: pts.map((p) => p.at.lat.toFixed(2)).join(','), longitude: pts.map((p) => p.at.lon.toFixed(2)).join(','), hourly: 'cloud_cover', models: 'gfs025', start_date: date, end_date: date, timezone: 'GMT' }).toString()}`
}

/** Every run's total cloud along the line at the hour: the control and each member. */
export function parseRuns(payload: unknown, at: Date): RunPath[] | null {
  const locs = Array.isArray(payload) ? payload : [payload]
  if (locs.length !== 8) return null
  const hourly = locs.map((l) => (l as { hourly?: Record<string, unknown> }).hourly)
  const times = hourly[0]?.time
  if (!Array.isArray(times)) return null
  const i = (times as string[]).indexOf(nearestHour(at))
  if (i < 0) return null
  const keys = Object.keys(hourly[0] ?? {}).filter((k) => /^cloud_cover(_member\d+)?$/.test(k))
  const runs = keys.map((k) => hourly.map((h) => {
    const x = (h?.[k] as unknown[] | undefined)?.[i]
    return typeof x === 'number' && Number.isFinite(x) ? x : null
  }))
  return runs.some((r) => r.some((x) => x !== null)) ? runs : null
}

export async function fetchRuns(at: LatLon, azimuthDeg: number, event: Date, fetchImpl: typeof fetch = fetch): Promise<RunPath[] | null> {
  const got = await weatherJson(ensembleUrl(at, azimuthDeg, event.toISOString().slice(0, 10)), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS * 2 })
  return got.ok ? parseRuns(got.payload, event) : null
}

/* ------------------------------------------------------------------- AFD */

export interface Afd {
  office: string
  issued: string
  text: string
}

/** The venue's forecast office's latest Area Forecast Discussion. Null when weather.gov does not answer. */
export async function fetchAfd(at: LatLon, fetchImpl: typeof fetch = fetch): Promise<Afd | null> {
  const headers = { accept: 'application/geo+json' }
  try {
    const p = await fetchImpl(`${NWS}/points/${r2(at.lat)},${r2(at.lon)}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!p.ok) return null
    const office = ((await p.json()) as { properties?: { cwa?: unknown } }).properties?.cwa
    if (typeof office !== 'string' || !/^[A-Z]{3}$/.test(office)) return null
    const list = await fetchImpl(`${NWS}/products/types/AFD/locations/${office}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!list.ok) return null
    const first = ((await list.json()) as { '@graph'?: { id?: unknown; issuanceTime?: unknown }[] })['@graph']?.[0]
    if (typeof first?.id !== 'string' || !/^[\w-]+$/.test(first.id)) return null
    const prod = await fetchImpl(`${NWS}/products/${first.id}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!prod.ok) return null
    const text = ((await prod.json()) as { productText?: unknown }).productText
    return typeof text === 'string' ? { office, issued: typeof first.issuanceTime === 'string' ? first.issuanceTime : '', text } : null
  } catch {
    return null
  }
}


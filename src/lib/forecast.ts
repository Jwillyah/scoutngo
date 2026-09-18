/*
 * Cloud forecast from Open-Meteo.
 *
 * Open-Meteo is free, needs no key, and asks for no account, which is why it is
 * used here: adding a key would break the "bring your own key, and only one"
 * promise in README.md.
 *
 * WHAT LEAVES THE DEVICE. A list of coordinates along the sightlines and the date
 * of the shoot. That is a fourth thing on the privacy list in README.md, and it
 * is the same category of disclosure as the map tiles: a set of points near the
 * venue. It happens only when a plan exists and a position is opened.
 *
 * NEVER THROUGH THE MODEL. A language model asked about cloud cover is guessing,
 * and a guess in the shape of a forecast is worse than no forecast at all. The
 * numbers here come from a weather model over HTTP, and the arithmetic over them
 * is in src/core/cloud.ts.
 */

import {
  sightlineSamplePoints,
  summariseSightline,
  type CloudSample,
  type SightlineCloud,
} from '../core/cloud.ts'
import type { LatLon } from '../core/geo.ts'

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
export const TIMEOUT_MS = 8000

/**
 * How far ahead the forecast is worth trusting. Open-Meteo serves 16 days; past
 * dates come back as recorded reanalysis rather than a forecast, which is a
 * different claim and is labelled differently.
 */
export const FORECAST_HORIZON_DAYS = 16

export type ForecastKind = 'forecast' | 'recorded'

export interface SightlineRequest {
  id: string
  from: LatLon
  /** Compass bearing from the position toward its subject. */
  bearing: number
}

export interface SightlineForecast {
  id: string
  cloud: SightlineCloud
}

export type ForecastResult =
  | {
      status: 'ok'
      kind: ForecastKind
      /** The hour actually used, as the API reported it. */
      hour: string
      sightlines: SightlineForecast[]
    }
  | { status: 'unavailable'; reason: string }

/** yyyy-mm-dd in UTC, which is the format Open-Meteo's date range wants. */
const isoDate = (date: Date): string => date.toISOString().slice(0, 10)

/** Whole days from today to the shoot, negative for a date already past. */
export function daysAhead(at: Date, now: Date = new Date()): number {
  const day = 86_400_000
  const a = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((a - b) / day)
}

export function forecastKind(at: Date, now: Date = new Date()): ForecastKind {
  return daysAhead(at, now) < 0 ? 'recorded' : 'forecast'
}

interface OpenMeteoPoint {
  hourly?: {
    time?: unknown
    cloud_cover_low?: unknown
    cloud_cover_mid?: unknown
    cloud_cover_high?: unknown
  }
}

const numberAt = (list: unknown, index: number): number => {
  if (!Array.isArray(list)) return 0
  const value = list[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * The index of the hour closest to the shoot time.
 *
 * Open-Meteo is asked for the venue's own timezone, so its `time` strings are
 * local wall clock without an offset. Comparing them as wall clock is therefore
 * correct, and is why the hour is matched on the string rather than on a Date.
 */
export function hourIndexFor(times: string[], venueHour: string): number {
  const exact = times.indexOf(venueHour)
  if (exact !== -1) return exact
  // Fall back to the same hour on the first day, then to the middle of the day.
  const hh = venueHour.slice(11, 13)
  const sameHour = times.findIndex((t) => t.slice(11, 13) === hh)
  return sameHour !== -1 ? sameHour : Math.min(12, Math.max(0, times.length - 1))
}

const cache = new Map<string, ForecastResult>()

export function clearForecastCache(): void {
  cache.clear()
}

/**
 * Cloud along every sightline, in one request.
 *
 * Open-Meteo takes comma separated coordinates and answers with one object per
 * point, so six positions at five distances is a single call rather than thirty.
 */
export async function fetchSightlineCloud(
  sightlines: SightlineRequest[],
  at: Date,
  timeZone: string,
  now: Date = new Date(),
): Promise<ForecastResult> {
  if (sightlines.length === 0) {
    return { status: 'unavailable', reason: 'No positions to forecast for.' }
  }

  const ahead = daysAhead(at, now)
  if (ahead > FORECAST_HORIZON_DAYS) {
    return {
      status: 'unavailable',
      reason: `That date is ${ahead} days out. Forecasts only run ${FORECAST_HORIZON_DAYS} days ahead.`,
    }
  }

  const points = sightlines.flatMap((line) =>
    sightlineSamplePoints(line.from, line.bearing).map((p) => ({ id: line.id, ...p })),
  )

  const date = isoDate(at)
  const key = `${date}|${timeZone}|${points
    .map((p) => `${p.at.lat.toFixed(3)},${p.at.lon.toFixed(3)}`)
    .join(';')}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const params = new URLSearchParams({
    latitude: points.map((p) => p.at.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.at.lon.toFixed(4)).join(','),
    hourly: 'cloud_cover_low,cloud_cover_mid,cloud_cover_high',
    start_date: date,
    end_date: date,
    timezone: timeZone,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      return { status: 'unavailable', reason: `Open-Meteo returned HTTP ${response.status}.` }
    }

    const payload = (await response.json()) as OpenMeteoPoint | OpenMeteoPoint[]
    // One coordinate comes back as an object; several come back as an array.
    const list = Array.isArray(payload) ? payload : [payload]
    if (list.length !== points.length) {
      return { status: 'unavailable', reason: 'Open-Meteo returned an unexpected shape.' }
    }

    const times = (list[0]?.hourly?.time as string[] | undefined) ?? []
    if (times.length === 0) {
      return { status: 'unavailable', reason: 'Open-Meteo returned no hours for that date.' }
    }
    const venueHour = `${date}T${String(at.getHours()).padStart(2, '0')}:00`
    const index = hourIndexFor(times, venueHour)

    const byId = new Map<string, CloudSample[]>()
    points.forEach((point, i) => {
      const hourly = list[i]?.hourly
      const sample: CloudSample = {
        distanceKm: point.distanceKm,
        low: numberAt(hourly?.cloud_cover_low, index),
        mid: numberAt(hourly?.cloud_cover_mid, index),
        high: numberAt(hourly?.cloud_cover_high, index),
      }
      const existing = byId.get(point.id)
      if (existing === undefined) byId.set(point.id, [sample])
      else existing.push(sample)
    })

    const result: ForecastResult = {
      status: 'ok',
      kind: forecastKind(at, now),
      hour: times[index] ?? venueHour,
      sightlines: sightlines.map((line) => ({
        id: line.id,
        cloud: summariseSightline(byId.get(line.id) ?? []),
      })),
    }
    cache.set(key, result)
    return result
  } catch (error) {
    return {
      status: 'unavailable',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The cloud forecast timed out.'
          : 'Could not reach the cloud forecast.',
    }
  } finally {
    clearTimeout(timer)
  }
}

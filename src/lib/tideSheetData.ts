/*
 * THE TIDE SHEET'S DATA BEYOND THE DAY'S TABLE: a month of highs and lows from
 * NOAA (for the glass mornings), the hourly wind from Open-Meteo for as far as
 * it forecasts, and the sea from Open-Meteo Marine (waves, swell, water
 * temperature). All keyless; each request names a coordinate and dates, and
 * nothing about the phone. Asked in GMT so every time parses as an instant.
 */
import type { LatLon } from '../core/geo.ts'
import type { TideExtreme } from '../core/tide.ts'
import { parseExtremes, PREDICTIONS_URL, APPLICATION } from './noaa.ts'
import { reportNetwork } from './netState.ts'
import { readForecast, saveForecast, savedKeys } from './savedForecast.ts'
import { SLOW_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

export const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'
export const WIND_URL = 'https://api.open-meteo.com/v1/forecast'
export const WIND_DAYS = 16
export const MONTH_DAYS = 31
const TIMEOUT_MS = 12_000

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    reportNetwork(true)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('HTTP'))) reportNetwork(false)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Open-Meteo through the shared store (src/lib/weatherStore.ts); a stale answer counts as no answer here, and the saved copy below says its age. */
async function getWeather(url: string): Promise<unknown> {
  const got = await weatherJson(url, { maxAgeMs: SLOW_MAX_AGE_MS, timeoutMs: TIMEOUT_MS })
  if (!got.ok) {
    if (got.unreachable) reportNetwork(false)
    throw new Error(got.reason)
  }
  /* A kept answer is not the network answering (Batch N). */
  if (!got.kept) reportNetwork(true)
  /*
   * Batch Map A3 (9 Nov, LTE: Tide "waiting for the sea forecast"): an older
   * answer while the new one is on its way used to count as none, so a page
   * with no copy saved below showed nothing. It is the last good forecast:
   * shown, said with its age, and replaced when the new one lands.
   */
  if (got.stale) throw new StaleAnswer(got.payload, got.fetchedAt)
  return got.payload
}

class StaleAnswer extends Error {
  readonly payload: unknown
  readonly fetchedAt: number
  constructor(payload: unknown, fetchedAt: number) {
    super('stale')
    this.payload = payload
    this.fetchedAt = fetchedAt
  }
}

/** Live, else the copy saved on the phone, else null. */
async function liveOrSaved<T>(key: string, url: string, parse: (payload: unknown) => T | null): Promise<{ value: T; savedAt: string | null } | null> {
  try {
    const payload = await (/open-meteo\.com\//.test(url) ? getWeather(url) : getJson(url))
    const value = parse(payload)
    if (value !== null) {
      saveForecast(key, payload)
      return { value, savedAt: null }
    }
  } catch (error) {
    /* An older answer from the weather store: shown with its age (savedAt) while the new one comes. */
    if (error instanceof StaleAnswer) {
      const value = parse(error.payload)
      if (value !== null) return { value, savedAt: new Date(error.fetchedAt).toISOString() }
    }
    /* Read the saved copy below. */
  }
  const saved = readForecast(key)
  const value = saved === null ? null : parse(saved.payload)
  return value === null || saved === null ? null : { value, savedAt: saved.fetchedAt }
}

const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`

/** NOAA's highs and lows from `from` for MONTH_DAYS, at one station. */
export async function fetchMonthExtremes(stationId: string, from: Date) {
  const begin = ymd(from)
  const end = ymd(new Date(from.getTime() + MONTH_DAYS * 86_400_000))
  const params = new URLSearchParams({ product: 'predictions', application: APPLICATION, begin_date: begin, end_date: end, datum: 'MLLW', station: stationId, time_zone: 'gmt', units: 'english', format: 'json', interval: 'hilo' })
  const parse = (p: unknown) => {
    const list = parseExtremes(p)
    return list.length === 0 ? null : list
  }
  const answer = await liveOrSaved<TideExtreme[]>(`tide-month|${stationId}|${begin}`, `${PREDICTIONS_URL}?${params}`, parse)
  if (answer !== null) return answer
  /*
   * NO SIGNAL, AND NOTHING SAVED FROM THIS EXACT DAY: a month saved from
   * another start (a venue saved for offline days ago) still holds these
   * turns. Only its turns from `from` on are used; a table that has none is
   * not one.
   */
  for (const key of savedKeys(`tide-month|${stationId}|`)) {
    const saved = readForecast(key)
    const list = saved === null ? null : parse(saved.payload)
    const ahead = list?.filter((e) => e.at.getTime() >= from.getTime() - 86_400_000) ?? []
    if (saved !== null && ahead.length > 0) return { value: ahead, savedAt: saved.fetchedAt }
  }
  return null
}

export interface Hourly {
  /** Epoch ms of each hour, UTC. */
  times: number[]
  values: Record<string, (number | null)[]>
}

const gmt = (s: string) => Date.parse(`${s}:00Z`)

export function parseHourly(payload: unknown, names: readonly string[]): Hourly | null {
  const hourly = (payload as { hourly?: Record<string, unknown> })?.hourly
  const time = hourly?.time
  if (!Array.isArray(time) || time.length === 0) return null
  const values: Record<string, (number | null)[]> = {}
  for (const n of names) {
    const list = hourly?.[n]
    values[n] = Array.isArray(list) ? list.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) : time.map(() => null)
  }
  return { times: (time as string[]).map(gmt), values }
}

/** The value at the hour nearest `at`, or null outside the series or where it said nothing. */
export function hourlyAt(series: Hourly, name: string, at: Date): number | null {
  const t = at.getTime()
  if (series.times.length === 0 || t < series.times[0] - 1_800_000 || t > series.times[series.times.length - 1] + 1_800_000) return null
  let best = 0
  for (let i = 1; i < series.times.length; i += 1) if (Math.abs(series.times[i] - t) < Math.abs(series.times[best] - t)) best = i
  return series.values[name]?.[best] ?? null
}

export const WIND_NAMES = ['wind_speed_10m', 'wind_direction_10m'] as const

export async function fetchWindMonth(at: LatLon) {
  const params = new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: WIND_NAMES.join(','), wind_speed_unit: 'ms', forecast_days: String(WIND_DAYS), timezone: 'GMT' })
  return liveOrSaved(`wind-month|${at.lat.toFixed(3)},${at.lon.toFixed(3)}`, `${WIND_URL}?${params}`, (p) => parseHourly(p, WIND_NAMES))
}

/*
 * THE BRIEFING'S WIND (Batch H): the week by the hour at 10 m with its gusts,
 * and at 120 m (about 400 ft) for the drone. One question, kept for the hour.
 */
/* And for the satellite nowcast: the air at 2 m (its ground reference) and the wind at 500 hPa (to advect the cloud). */
/* Batch M: and the home's weather block (the sky's WMO code, the rain), in the same one question: 10 variables, one call. */
export const BRIEF_WIND_NAMES = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_120m', 'temperature_2m', 'wind_speed_500hPa', 'wind_direction_500hPa', 'weather_code', 'precipitation', 'cloud_cover'] as const
export async function fetchBriefWind(at: LatLon): Promise<Hourly | null> {
  const params = new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: BRIEF_WIND_NAMES.join(','), wind_speed_unit: 'ms', forecast_days: '7', timezone: 'GMT' })
  /* A kept answer, stale or not, is shown while a new one is fetched behind it (Batch M: never a blank home while refreshing). */
  const got = await weatherJson(`${WIND_URL}?${params}`, { maxAgeMs: SLOW_MAX_AGE_MS, timeoutMs: TIMEOUT_MS })
  return got.ok ? parseHourly(got.payload, BRIEF_WIND_NAMES) : null
}

/*
 * THE WEATHER PAGE'S OWN NUMBERS (Batch Pages, Section 2): feels-like, UV,
 * humidity, dew point and pressure, by the hour, from yesterday for the week
 * (the pressure's trend reads three hours back; seven days bill as one call). Asked only while the Weather
 * page is open, through the same forecast cache as the briefing's.
 */
export const WEATHER_EXTRA_NAMES = ['apparent_temperature', 'uv_index', 'relative_humidity_2m', 'dew_point_2m', 'pressure_msl'] as const
export async function fetchWeatherExtras(at: LatLon): Promise<Hourly | null> {
  const params = new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: WEATHER_EXTRA_NAMES.join(','), past_days: '1', forecast_days: '7', timezone: 'GMT' })
  const got = await weatherJson(`${WIND_URL}?${params}`, { maxAgeMs: SLOW_MAX_AGE_MS, timeoutMs: TIMEOUT_MS })
  return got.ok ? parseHourly(got.payload, WEATHER_EXTRA_NAMES) : null
}

export const SKY_NAMES = ['cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility'] as const

/** The sky by the hour for as far as Open-Meteo forecasts: the cover at three heights and the visibility (metres), for the 3D preview's clouds and haze. */
export async function fetchSkyHours(at: LatLon) {
  const params = new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: SKY_NAMES.join(','), forecast_days: String(WIND_DAYS), timezone: 'GMT' })
  return liveOrSaved(`sky-hours|${at.lat.toFixed(3)},${at.lon.toFixed(3)}`, `${WIND_URL}?${params}`, (p) => parseHourly(p, SKY_NAMES))
}

/* Secondary and tertiary swell for the Surf page's three trains (30 Oct); Open-Meteo Marine answered all six on 30 Oct. */
export const MARINE_NAMES = ['wave_height', 'wave_direction', 'wave_period', 'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period', 'secondary_swell_wave_height', 'secondary_swell_wave_period', 'secondary_swell_wave_direction', 'tertiary_swell_wave_height', 'tertiary_swell_wave_period', 'tertiary_swell_wave_direction', 'wind_wave_height', 'wind_wave_period', 'wind_wave_direction', 'sea_surface_temperature'] as const

/** The sea for the next week. Inland, Open-Meteo answers with nothing in the series: null. */
export async function fetchMarine(at: LatLon) {
  const params = new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: MARINE_NAMES.join(','), forecast_days: '7', timezone: 'GMT' })
  return liveOrSaved(`marine|${at.lat.toFixed(3)},${at.lon.toFixed(3)}`, `${MARINE_URL}?${params}`, (p) => {
    const h = parseHourly(p, MARINE_NAMES)
    return h !== null && h.values.wave_height.some((v) => v !== null) ? h : null
  })
}

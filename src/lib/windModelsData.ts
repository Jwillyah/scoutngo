/*
 * THE WIND PAGE'S NUMBERS: five models from Open-Meteo at three heights, and
 * what the nearest buoy and weather station are measuring now.
 *
 * WHAT LEAVES THE PHONE. To Open-Meteo: the venue rounded to 2 decimals and
 * five model names. To this app's /api/buoy: a buoy number. To
 * api.weather.gov: the venue to 2 decimals, to find the nearest station.
 */
import type { LatLon } from '../core/geo.ts'
import { parseMetarWind } from '../core/metar.ts'
import { summarise, type WindHour } from '../core/windModels.ts'
import { aloftFactor, type Stability } from '../core/localWind.ts'
import { sunAltitude } from '../core/shooterStorm.ts'
import { BUOY_ENDPOINT, nearestBuoys } from './buoy.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { FORECAST_MAX_AGE_MS, weatherJson } from './weatherStore.ts'
import { fetchStationSkies } from './skyFireData.ts'

export const WIND_MODELS = ['gfs_seamless', 'gfs_hrrr', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'] as const
export const MODEL_NAME: Record<(typeof WIND_MODELS)[number], string> = { gfs_seamless: 'GFS', gfs_hrrr: 'HRRR', ecmwf_ifs025: 'ECMWF', icon_seamless: 'ICON', gem_seamless: 'GEM' }
export type WindLevel = 'ground' | '80m' | '120m'
export const LEVEL_LABEL: Record<WindLevel, string> = { ground: 'Ground', '80m': '80 m', '120m': '120 m' }
const VAR: Record<WindLevel, string> = { ground: '10m', '80m': '80m', '120m': '120m' }
export const WIND_DAYS = 3

export function windModelsUrl(at: LatLon): string {
  const hourly = (['ground', '80m', '120m'] as const).flatMap((l) => [`wind_speed_${VAR[l]}`, `wind_direction_${VAR[l]}`]).concat('wind_gusts_10m', 'temperature_2m', 'cloud_cover')
  const params = new URLSearchParams({
    latitude: at.lat.toFixed(2),
    longitude: at.lon.toFixed(2),
    hourly: hourly.join(','),
    models: WIND_MODELS.join(','),
    wind_speed_unit: 'ms',
    forecast_days: String(WIND_DAYS),
    timezone: 'GMT',
  })
  return `${OPEN_METEO_URL}?${params.toString()}`
}

export interface WindModels {
  hours: Date[]
  /** byLevel[level][hour] */
  byLevel: Record<WindLevel, WindHour[]>
  /** Each model's ground speed per hour, for the whisker's ends, m/s. */
  perModel: Record<string, (number | null)[]>
  /** The models' median 2 m temperature and cloud per hour: the sea breeze's contrast, the air's stability. */
  tempC: (number | null)[]
  cloud: (number | null)[]
  /** Per hour, how many times the ground wind it is at 400 ft for the air's state (src/core/localWind.ts). */
  aloft: ({ cls: Stability; alpha: number; factor: number } | null)[]
  /** Models with no 120 m level of their own (HRRR): their 120 m is their ground wind times the factor. */
  filled120: string[]
}

const median = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b)
  return v.length === 0 ? null : v.length % 2 === 1 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}

export function parseWindModels(payload: unknown, venue?: LatLon): WindModels | null {
  const hourly = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  const time = hourly?.time
  if (!Array.isArray(time) || hourly === undefined) return null
  const series = (name: string): (number | null)[] => {
    const list = hourly[name]
    return Array.isArray(list) ? list.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)) : time.map(() => null)
  }
  const models = WIND_MODELS.filter((m) => series(`wind_speed_10m_${m}`).some((x) => x !== null))
  if (models.length === 0) return null
  const hours = (time as string[]).map((t) => new Date(`${t}:00Z`))
  const tempC = time.map((_, h) => median(models.map((m) => series(`temperature_2m_${m}`)[h])))
  const cloud = time.map((_, h) => median(models.map((m) => series(`cloud_cover_${m}`)[h])))
  const ground = time.map((_, h) => median(models.map((m) => series(`wind_speed_10m_${m}`)[h])))
  /* The air's state each hour, at 400 ft and at 120 m (the level a model without one is filled at). */
  const state = (h: number, heightM?: number) => (venue === undefined || ground[h] === null ? null : aloftFactor(sunAltitude(hours[h], venue), cloud[h], ground[h] as number, heightM))
  const filled120 = venue === undefined ? [] : models.filter((m) => !series(`wind_speed_120m_${m}`).some((x) => x !== null))
  const levelSeries = (l: WindLevel, m: (typeof WIND_MODELS)[number]): (number | null)[] => {
    if (l !== '120m' || !filled120.includes(m)) return series(`wind_speed_${VAR[l]}_${m}`)
    return series(`wind_speed_10m_${m}`).map((v, h) => (v === null ? null : v * (state(h, 120)?.factor ?? 1)))
  }
  const byLevel = Object.fromEntries(
    (['ground', '80m', '120m'] as const).map((l) => {
      const sp = models.map((m) => levelSeries(l, m))
      const di = models.map((m) => series(`wind_direction_${VAR[l === '120m' && filled120.includes(m) ? '80m' : l]}_${m}`))
      const gu = l === 'ground' ? models.map((m) => series(`wind_gusts_10m_${m}`)) : []
      return [l, time.map((_, h) => summarise(sp.map((s) => s[h]), di.map((d) => d[h]), gu.map((g) => g[h])))]
    }),
  ) as Record<WindLevel, WindHour[]>
  return {
    hours,
    byLevel,
    perModel: Object.fromEntries(models.map((m) => [m, series(`wind_speed_10m_${m}`)])),
    tempC,
    cloud,
    aloft: time.map((_, h) => state(h)),
    filled120: filled120.map((m) => MODEL_NAME[m]),
  }
}

export async function fetchWindModels(at: LatLon, fetchImpl: typeof fetch = fetch): Promise<WindModels | null> {
  const got = await weatherJson(windModelsUrl(at), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS * 2 })
  return got.ok ? parseWindModels(got.payload, at) : null
}

export interface Measured {
  source: string
  at: Date
  mps: number
  fromDeg: number | null
  gustMps: number | null
}

const KT = 0.514444

/** The nearest weather station's METAR wind, and the nearest buoy's: what is blowing now. */
export async function fetchMeasuredWind(venue: LatLon): Promise<Measured[]> {
  const out: Measured[] = []
  const [skies, buoy] = await Promise.all([
    fetchStationSkies(venue, fetch, 1).catch(() => []),
    (async () => {
      const b = nearestBuoys(venue, 1)[0]
      if (b === undefined) return null
      try {
        const r = await fetch(BUOY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ station: b.id }) })
        const body = (await r.json()) as { wind?: { at: string; mps: number; fromDeg: number | null; gustMps: number | null } | null }
        return body.wind == null ? null : { source: `buoy ${b.id}`, at: new Date(body.wind.at), mps: body.wind.mps, fromDeg: body.wind.fromDeg, gustMps: body.wind.gustMps }
      } catch {
        return null
      }
    })(),
  ])
  for (const s of skies) {
    const w = parseMetarWind(s.raw)
    if (w !== null) out.push({ source: s.sky.station, at: new Date(s.at), mps: w.kt * KT, fromDeg: w.fromDeg, gustMps: w.gustKt === null ? null : w.gustKt * KT })
  }
  if (buoy !== null) out.push(buoy)
  return out
}

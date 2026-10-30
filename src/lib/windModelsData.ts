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
import { BUOY_ENDPOINT, nearestBuoys } from './buoy.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { fetchStationSkies } from './skyFireData.ts'

export const WIND_MODELS = ['gfs_seamless', 'gfs_hrrr', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'] as const
export const MODEL_NAME: Record<(typeof WIND_MODELS)[number], string> = { gfs_seamless: 'GFS', gfs_hrrr: 'HRRR', ecmwf_ifs025: 'ECMWF', icon_seamless: 'ICON', gem_seamless: 'GEM' }
export type WindLevel = 'ground' | '80m' | '120m'
export const LEVEL_LABEL: Record<WindLevel, string> = { ground: 'Ground', '80m': '80 m', '120m': '120 m' }
const VAR: Record<WindLevel, string> = { ground: '10m', '80m': '80m', '120m': '120m' }
export const WIND_DAYS = 3

export function windModelsUrl(at: LatLon): string {
  const hourly = (['ground', '80m', '120m'] as const).flatMap((l) => [`wind_speed_${VAR[l]}`, `wind_direction_${VAR[l]}`]).concat('wind_gusts_10m')
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
}

export function parseWindModels(payload: unknown): WindModels | null {
  const hourly = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  const time = hourly?.time
  if (!Array.isArray(time) || hourly === undefined) return null
  const series = (name: string): (number | null)[] => {
    const list = hourly[name]
    return Array.isArray(list) ? list.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)) : time.map(() => null)
  }
  const models = WIND_MODELS.filter((m) => series(`wind_speed_10m_${m}`).some((x) => x !== null))
  if (models.length === 0) return null
  const byLevel = Object.fromEntries(
    (['ground', '80m', '120m'] as const).map((l) => {
      const sp = models.map((m) => series(`wind_speed_${VAR[l]}_${m}`))
      const di = models.map((m) => series(`wind_direction_${VAR[l]}_${m}`))
      const gu = l === 'ground' ? models.map((m) => series(`wind_gusts_10m_${m}`)) : []
      return [l, time.map((_, h) => summarise(sp.map((s) => s[h]), di.map((d) => d[h]), gu.map((g) => g[h])))]
    }),
  ) as Record<WindLevel, WindHour[]>
  return {
    hours: (time as string[]).map((t) => new Date(`${t}:00Z`)),
    byLevel,
    perModel: Object.fromEntries(models.map((m) => [m, series(`wind_speed_10m_${m}`)])),
  }
}

export async function fetchWindModels(at: LatLon, fetchImpl: typeof fetch = fetch): Promise<WindModels | null> {
  try {
    const r = await fetchImpl(windModelsUrl(at), { signal: AbortSignal.timeout(TIMEOUT_MS * 2) })
    return r.ok ? parseWindModels(await r.json()) : null
  } catch {
    return null
  }
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

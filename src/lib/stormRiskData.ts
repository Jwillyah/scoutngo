/*
 * STORM INGREDIENTS, FETCHED (Batch K, Section 3). Arithmetic is
 * src/core/stormRisk.ts.
 *
 * WHAT LEAVES THE PHONE.
 *   Open-Meteo           the venue to 2 decimals and four model names
 *   Open-Meteo ensemble  the venue to 2 decimals: the 31 GFS runs' rain
 *   SPC (spc.noaa.gov)   nothing about you: the national day 1 and day 2
 *                        outlooks, whole
 *   Iowa State (IEM)     nothing about you: every watch and mesoscale
 *                        discussion in force, whole
 * Which polygon holds the venue is worked out on the phone. The SPC's
 * words are shown as theirs and never read by the storm line.
 */
import { useEffect, useState } from 'react'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import type { LatLon } from '../core/geo.ts'
import { localDate } from '../core/modelSkill.ts'
import { outlookAt, rainOdds, shearMs, stormDay, type IngredientHour, type StormDay } from '../core/stormRisk.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { ENSEMBLE_URL } from './vividData.ts'
import { FORECAST_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

export const STORM_MODELS = ['gfs_hrrr', 'gfs_global', 'ecmwf_ifs025', 'icon_seamless'] as const
export const SPC_OUTLOOK = (day: 1 | 2) => `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.lyr.geojson`
export const IEM_WATCHES = 'https://mesonet.agron.iastate.edu/api/1/spc_watch_outline.geojson'
export const IEM_MCDS = 'https://mesonet.agron.iastate.edu/api/1/nws/spc_mcd.geojson'
const VARS = ['cape', 'convective_inhibition', 'lifted_index', 'total_column_integrated_water_vapour', 'precipitation', 'wind_speed_10m', 'wind_direction_10m', 'wind_speed_500hPa', 'wind_direction_500hPa']

export function ingredientsUrl(at: LatLon): string {
  return `${OPEN_METEO_URL}?${new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: VARS.join(','), models: STORM_MODELS.join(','), wind_speed_unit: 'ms', forecast_days: '2', timezone: 'GMT' }).toString()}`
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

export function parseIngredients(payload: unknown): IngredientHour[] | null {
  const h = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  if (h === undefined || !Array.isArray(h.time)) return null
  const col = (v: string, m: string, i: number) => num((h[`${v}_${m}`] as unknown[] | undefined)?.[i])
  return (h.time as string[]).map((t, i) => ({
    at: new Date(`${t}:00Z`),
    models: STORM_MODELS.map((m) => ({
      cape: col('cape', m, i),
      cin: col('convective_inhibition', m, i),
      li: col('lifted_index', m, i),
      pw: col('total_column_integrated_water_vapour', m, i),
      rain: col('precipitation', m, i),
      shear: shearMs(col('wind_speed_10m', m, i), col('wind_direction_10m', m, i), col('wind_speed_500hPa', m, i), col('wind_direction_500hPa', m, i)),
    })),
  }))
}

export const rainRunsUrl = (at: LatLon): string =>
  `${ENSEMBLE_URL}?${new URLSearchParams({ latitude: at.lat.toFixed(2), longitude: at.lon.toFixed(2), hourly: 'precipitation', models: 'gfs025', forecast_days: '3', timezone: 'GMT' }).toString()}`

export function parseRainRuns(payload: unknown): { times: Date[]; runs: (number | null)[][] } | null {
  const h = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  if (h === undefined || !Array.isArray(h.time)) return null
  const keys = Object.keys(h).filter((k) => /^precipitation(_member\d+)?$/.test(k))
  if (keys.length === 0) return null
  return { times: (h.time as string[]).map((t) => new Date(`${t}:00Z`)), runs: keys.map((k) => ((h[k] as unknown[]) ?? []).map(num)) }
}

type FC = { features?: { properties?: Record<string, unknown>; geometry?: unknown }[] }

async function geojson(url: string, fetchImpl: typeof fetch): Promise<FC | null> {
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return r.ok ? ((await r.json()) as FC) : null
  } catch {
    return null
  }
}

/** The features whose polygon holds the venue. */
export function holding(fc: FC | null, venue: LatLon): Record<string, unknown>[] {
  const pt: GeoJSON.Feature<GeoJSON.Point> = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [venue.lon, venue.lat] } }
  return (fc?.features ?? []).flatMap((f) => {
    const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined
    if (g == null || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return []
    try {
      return booleanPointInPolygon(pt, g) ? [f.properties ?? {}] : []
    } catch {
      return []
    }
  })
}

export interface SpcRead {
  /** Day 1 (today) and day 2 (tomorrow): the category at the venue, or null outside any. */
  outlook: [{ label: string; word: string } | null, { label: string; word: string } | null] | null
  watches: { kind: string; num: number; until: Date | null }[] | null
  /** Discussions over the venue: their number and what they concern, as written. */
  mcds: { num: number; concerning: string; until: Date | null }[] | null
}

export async function fetchSpc(venue: LatLon, now: Date, fetchImpl: typeof fetch = fetch): Promise<SpcRead> {
  const [d1, d2, w, m] = await Promise.all([geojson(SPC_OUTLOOK(1), fetchImpl), geojson(SPC_OUTLOOK(2), fetchImpl), geojson(IEM_WATCHES, fetchImpl), geojson(IEM_MCDS, fetchImpl)])
  const label = (fc: FC | null) => outlookAt(holding(fc, venue).map((p) => String(p.LABEL ?? '')))
  const date = (x: unknown) => (typeof x === 'string' && Number.isFinite(Date.parse(x)) ? new Date(x) : null)
  return {
    outlook: d1 === null && d2 === null ? null : [label(d1), label(d2)],
    watches: w === null ? null : holding(w, venue).map((p) => ({ kind: p.type === 'TOR' ? 'Tornado Watch' : 'Severe Thunderstorm Watch', num: Number(p.num), until: date(p.utc_expired) })).filter((x) => x.until === null || x.until > now),
    mcds: m === null ? null : holding(m, venue).map((p) => ({ num: Number(p.num), concerning: String(p.concerning ?? ''), until: date(p.expire) })).filter((x) => x.until === null || x.until > now),
  }
}

export interface StormRisk {
  days: { date: string; word: 'today' | 'tomorrow'; storm: StormDay; rain: ReturnType<typeof rainOdds> | null }[]
  spc: SpcRead
}

export function useStormRisk(venue: LatLon | null, timeZone: string | null, on: boolean): StormRisk | null {
  const [got, setGot] = useState<StormRisk | null>(null)
  const lat = venue?.lat
  const lon = venue?.lon
  useEffect(() => {
    if (!on || lat === undefined || lon === undefined || timeZone === null) return
    let live = true
    const at = { lat, lon }
    void (async () => {
      const now = new Date()
      const [ing, ens, spc] = await Promise.all([
        weatherJson(ingredientsUrl(at), { maxAgeMs: FORECAST_MAX_AGE_MS, timeoutMs: TIMEOUT_MS * 2 }),
        weatherJson(rainRunsUrl(at), { maxAgeMs: FORECAST_MAX_AGE_MS, timeoutMs: TIMEOUT_MS * 2 }),
        fetchSpc(at, now),
      ])
      if (!live) return
      const hours = ing.ok ? parseIngredients(ing.payload) ?? [] : []
      const rr = ens.ok ? parseRainRuns(ens.payload) : null
      const today = localDate(now, timeZone)
      const tomorrow = localDate(new Date(now.getTime() + 86_400_000), timeZone)
      const days = ([[today, 'today'], [tomorrow, 'tomorrow']] as const).map(([date, word]) => {
        const keep = (t: Date) => localDate(t, timeZone) === date && t.getTime() >= now.getTime() - 3_600_000
        const idx = rr === null ? [] : rr.times.map((t, i) => (keep(t) ? i : -1)).filter((i) => i >= 0)
        return {
          date,
          word,
          storm: stormDay(date, hours.filter((h) => keep(h.at))),
          rain: rr === null || idx.length === 0 ? null : rainOdds(rr.runs.map((r) => idx.map((i) => r[i] ?? null)), idx.map((i) => rr.times[i])),
        }
      })
      setGot({ days, spc })
    })()
    return () => {
      live = false
    }
  }, [on, lat, lon, timeZone])
  return got
}

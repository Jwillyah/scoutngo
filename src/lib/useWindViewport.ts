/*
 * THE WIND OVER THE SCREEN (Batch Map, Section 1). The blocks that cover the
 * map's view (src/core/windViewport.ts), each asked through the shared
 * weather store and so through the forecast cache: a block is one URL for
 * every phone, kept an hour (no more than one request per block per hour).
 * Asked when the map stops moving, never while a finger is on it, and only
 * while the wind layer is on. Nothing in a request says where the user is:
 * only the blocks' fixed points.
 *
 * Model: Blend is Open-Meteo's best match for the place (its blend of the
 * models); HRRR (3 km, the US only) and ECMWF (IFS 0.25°) by name.
 */
import { useEffect, useMemo, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { blocksFor, buildField, gridStep, toUV, type Bounds, type Field, type WindSample } from '../core/windViewport.ts'
import { FORECAST_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

export type WindModelChip = 'hrrr' | 'blend' | 'ecmwf'
export const MODEL_CHIPS: readonly { id: WindModelChip; label: string; param: string | null }[] = [
  { id: 'hrrr', label: 'HRRR', param: 'gfs_hrrr' },
  { id: 'blend', label: 'Blend', param: null },
  { id: 'ecmwf', label: 'ECMWF', param: 'ecmwf_ifs025' },
]
export const WIND_GRID_DAYS = 3
export const WIND_GRID_MAX_DAYS = 7
/** Days to ask for: three, or as many as reach the time on the bar (a plan days ahead), up to seven. */
export function gridDays(at: Date | null, now: number = Date.now()): number {
  if (at === null) return WIND_GRID_DAYS
  const today = Math.floor(now / 86_400_000) * 86_400_000
  return Math.max(WIND_GRID_DAYS, Math.min(WIND_GRID_MAX_DAYS, Math.floor((at.getTime() - today) / 86_400_000) + 1))
}
const URL_BASE = 'https://api.open-meteo.com/v1/forecast'

export function blockUrl(points: readonly { lat: number; lon: number }[], model: WindModelChip, days: number = WIND_GRID_DAYS): string {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat.toFixed(2)).join(','),
    longitude: points.map((x) => x.lon.toFixed(2)).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'ms',
    forecast_days: String(days),
    timezone: 'GMT',
  })
  const param = MODEL_CHIPS.find((m) => m.id === model)?.param ?? null
  if (param !== null) p.set('models', param)
  return `${URL_BASE}?${p.toString()}`
}

/** One point's hours. */
export interface PointSeries {
  lat: number
  lon: number
  times: number[]
  speed: (number | null)[]
  from: (number | null)[]
  gust: (number | null)[]
}

export function parseBlock(payload: unknown, points: readonly { lat: number; lon: number }[]): PointSeries[] {
  const list = Array.isArray(payload) ? payload : [payload]
  const num = (a: unknown, i: number) => (Array.isArray(a) && typeof a[i] === 'number' ? (a[i] as number) : null)
  return points.flatMap((pt, k) => {
    const h = (list[k] as { hourly?: Record<string, unknown> } | undefined)?.hourly
    const time = Array.isArray(h?.time) ? (h.time as string[]) : []
    if (time.length === 0) return []
    return [
      {
        lat: pt.lat,
        lon: pt.lon,
        times: time.map((t) => Date.parse(`${t}:00Z`)),
        speed: time.map((_, i) => num(h?.wind_speed_10m, i)),
        from: time.map((_, i) => num(h?.wind_direction_10m, i)),
        gust: time.map((_, i) => num(h?.wind_gusts_10m, i)),
      },
    ]
  })
}

/** The field at one hour (the nearest the series has). */
export function fieldAt(series: readonly PointSeries[], step: number, at: Date): Field | null {
  const t = at.getTime()
  const samples: WindSample[] = []
  for (const s of series) {
    let best = -1
    for (let i = 0; i < s.times.length; i += 1) if (best < 0 || Math.abs(s.times[i] - t) < Math.abs(s.times[best] - t)) best = i
    if (best < 0 || Math.abs(s.times[best] - t) > 90 * 60_000) continue
    const sp = s.speed[best]
    const fr = s.from[best]
    if (sp === null || fr === null) continue
    samples.push({ lat: s.lat, lon: s.lon, ...toUV(sp, fr), gust: s.gust[best] })
  }
  return buildField(samples, step)
}

export interface WindViewport {
  series: PointSeries[]
  step: number
  status: 'off' | 'loading' | 'ok' | 'failed'
  /** Requests this view asked (each a block), and how many came from the phone's own store. */
  asked: number
}

const boundsOf = (m: maplibregl.Map): Bounds => {
  const b = m.getBounds()
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
}

export function useWindViewport(map: maplibregl.Map | null, on: boolean, model: WindModelChip, at: Date | null = null): WindViewport {
  const days = gridDays(at)
  const [view, setView] = useState<{ bounds: Bounds; zoom: number } | null>(null)
  const [got, setGot] = useState<{ key: string; v: WindViewport } | null>(null)
  useEffect(() => {
    if (map === null || !on) return
    let t: ReturnType<typeof setTimeout> | null = null
    const read = () => setView({ bounds: boundsOf(map), zoom: map.getZoom() })
    const settle = () => {
      if (t !== null) clearTimeout(t)
      t = setTimeout(read, 350)
    }
    read()
    map.on('moveend', settle)
    return () => {
      if (t !== null) clearTimeout(t)
      map.off('moveend', settle)
    }
  }, [map, on])

  const plan = useMemo(() => {
    if (view === null) return null
    const step = gridStep(view.bounds, view.zoom)
    return { step, blocks: blocksFor(view.bounds, step) }
  }, [view])
  const key = plan === null ? null : `${model}|${days}|${plan.step}|${plan.blocks.map((b) => `${b.south},${b.west}`).join(';')}`

  useEffect(() => {
    if (!on || plan === null || key === null) return
    let live = true
    void Promise.all(
      plan.blocks.map(async (b) => {
        const r = await weatherJson(blockUrl(b.points, model, days), { maxAgeMs: FORECAST_MAX_AGE_MS })
        return r.ok ? parseBlock(r.payload, b.points) : null
      }),
    ).then((parts) => {
      if (!live) return
      const ok = parts.filter((p): p is PointSeries[] => p !== null)
      setGot({ key, v: { series: ok.flat(), step: plan.step, status: ok.length === 0 ? 'failed' : 'ok', asked: plan.blocks.length } })
    })
    return () => {
      live = false
    }
  }, [on, key, plan, model, days])

  if (!on) return { series: [], step: 0.25, status: 'off', asked: 0 }
  /* A new view keeps drawing the last one's wind until its own arrives. */
  if (got === null) return { series: [], step: plan?.step ?? 0.25, status: 'loading', asked: 0 }
  return got.key === key ? got.v : { ...got.v, status: 'loading' }
}

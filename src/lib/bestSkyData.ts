/*
 * WHERE'S THE COLOR: THE GRID'S FIGURES, FETCHED (Batch BEST SKY, Section 1).
 * Arithmetic is src/core/bestSky.ts.
 *
 * WHAT LEAVES THE PHONE. One question per tile: 25 points on the forecast
 * cache's 0.05° grid (api/forecast.ts refuses anything finer), the tile's
 * own fixed square, never the spot; through the shared store, so a tile is
 * asked at most once an hour (FORECAST_MAX_AGE_MS). In the nowcast window,
 * GOES-East tiles by their numbers (NASA GIBS).
 */
import { COLD_BY_C, inNowcast } from '../core/goesNowcast.ts'
import type { LatLon } from '../core/geo.ts'
import { gridTiles, type PointSky, type RadiusMi } from '../core/bestSky.ts'
import { OPEN_METEO_URL } from './forecast.ts'
import { satAtPoints, SAT_LATENCY_MS } from './goesNowcast.ts'
import { snapToFrame } from './goesLayer.ts'
import { nearestHour } from './skyFireData.ts'
import { FORECAST_MAX_AGE_MS, weatherJson } from './weatherStore.ts'
import { driftOf, driftPatches, type Drift } from '../core/satDrift.ts'

/** One tile's question: its 25 points' low, mid and high cloud, for the event's day. */
export function tileUrl(points: readonly LatLon[], date: string): string {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat.toFixed(2)).join(','),
    longitude: points.map((x) => x.lon.toFixed(2)).join(','),
    /* Batch NOW, Section 0.3: the 500 hPa wind with it, to carry the satellite's patch to the color's time (src/core/satDrift.ts). */
    hourly: 'cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_500hPa,wind_direction_500hPa',
    start_date: date,
    end_date: date,
    timezone: 'GMT',
  })
  return `${OPEN_METEO_URL}?${p.toString()}`
}

type Loc = { hourly?: { time?: string[]; cloud_cover_low?: (number | null)[]; cloud_cover_mid?: (number | null)[]; cloud_cover_high?: (number | null)[]; wind_speed_500hPa?: (number | null)[]; wind_direction_500hPa?: (number | null)[] } }

/** A tile's answer at one hour, point by point; null where it did not say. */
export function readTile(payload: unknown, points: readonly LatLon[], hour: string): PointSky[] | null {
  const list = (Array.isArray(payload) ? payload : [payload]) as Loc[]
  if (list.length !== points.length) return null
  return list.map((l, i) => {
    const k = l.hourly?.time?.indexOf(hour) ?? -1
    const at = (s: (number | null)[] | undefined) => (k < 0 || s === undefined ? null : (s[k] ?? null))
    return { ...points[i], low: at(l.hourly?.cloud_cover_low), mid: at(l.hourly?.cloud_cover_mid), high: at(l.hourly?.cloud_cover_high), wind500: { kmh: at(l.hourly?.wind_speed_500hPa), fromDeg: at(l.hourly?.wind_direction_500hPa) } }
  })
}

/** The grid's cloud at the event's hour, and the satellite's patches when the event is near. */
export async function fetchGrid(spot: LatLon, radius: RadiusMi, event: Date, now: Date = new Date()): Promise<{ points: PointSky[]; asked: number; satAt: Date | null; satAsked: boolean; drift?: Drift | null }> {
  const tiles = gridTiles(spot, radius)
  const date = event.toISOString().slice(0, 10)
  const hour = nearestHour(event)
  const parts = await Promise.all(
    tiles.map(async (t) => {
      const r = await weatherJson(tileUrl(t.points, date), { maxAgeMs: FORECAST_MAX_AGE_MS })
      return r.ok ? readTile(r.payload, t.points, hour) : null
    }),
  )
  const points = parts.flatMap((p) => p ?? [])
  if (!inNowcast(event, now) || points.length === 0) return { points, asked: tiles.length, satAt: null, satAsked: false }
  const frame = snapToFrame(new Date(now.getTime() - SAT_LATENCY_MS))
  const temps = await satAtPoints(points, frame).catch(() => null)
  if (temps === null) return { points, asked: tiles.length, satAt: null, satAsked: true }
  const known = temps.filter((c): c is number => c !== null)
  const ground = known.length === 0 ? null : Math.max(...known)
  const seen = points.map((p, i) => ({ ...p, satPatch: ground === null || temps[i] === null ? null : (temps[i] as number) < ground - COLD_BY_C }))
  /* Batch NOW, Section 0.3: from the frame's time to the color's, with the 500 hPa wind. */
  const drift = driftOf(points.map((p) => p.wind500 ?? { kmh: null, fromDeg: null }), event.getTime() - frame.getTime())
  return {
    points: driftPatches(seen, drift),
    asked: tiles.length,
    satAt: frame,
    satAsked: true,
    drift,
  }
}

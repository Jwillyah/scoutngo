/*
 * THE STATION UNDER THE CROSSHAIR (Batch Map, Section 1): when an airport
 * weather station (ASOS/AWOS, src/data/asosStations.ts) is within
 * STATION_KM of the crosshair, its latest reading beside the forecast's
 * ("KFFA reads 8 kt W"). Picked on the phone from the bundled list; only the
 * station's id is sent (weather.gov, else this app's /api/metar).
 */
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { parseMetarWind } from '../core/metar.ts'
import { stationSky } from './skyFireData.ts'

export const STATION_KM = 15

type Row = readonly [string, string, number, number]
let list: readonly Row[] | null = null

export async function nearestStation(at: LatLon, km = STATION_KM): Promise<{ id: string; name: string; km: number } | null> {
  list ??= (await import('../data/asosStations.ts')).ASOS_STATIONS
  let best: { id: string; name: string; km: number } | null = null
  for (const [id, name, lat, lon] of list) {
    if (Math.abs(lat - at.lat) > 0.3 || Math.abs(lon - at.lon) > 0.4) continue
    const d = distanceMeters(at, { lat, lon }) / 1000
    if (d <= km && (best === null || d < best.km)) best = { id, name, km: d }
  }
  return best
}

export interface StationWind {
  id: string
  kt: number
  fromDeg: number | null
  gustKt: number | null
  at: string
}

const cache = new Map<string, { t: number; v: StationWind | null }>()
/** A station's latest METAR wind, asked at most every 10 minutes. */
export async function stationWind(id: string): Promise<StationWind | null> {
  const kept = cache.get(id)
  if (kept !== undefined && Date.now() - kept.t < 10 * 60_000) return kept.v
  const s = await stationSky(id)
  const w = s === null ? null : parseMetarWind(s.raw)
  const v = w === null || s === null ? null : { id, kt: w.kt, fromDeg: w.fromDeg, gustKt: w.gustKt, at: s.at }
  cache.set(id, { t: Date.now(), v })
  return v
}

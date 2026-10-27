/*
 * THE REAL CHECK ON THE SURF FORECAST: the nearest NDBC buoy's latest waves.
 *
 * The phone picks the buoy from the list baked into the app (src/data/ndbc.ts)
 * and sends only its number to api/buoy.ts, which reads NDBC's public file
 * (NDBC sends no CORS header, so a browser cannot read it directly). The
 * venue never leaves the phone for this.
 */
import { NDBC_BUOYS } from '../data/ndbc.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { reportNetwork } from './offlineCache.ts'

export const BUOY_ENDPOINT = '/api/buoy'
/** Past this, a buoy says little about this beach. */
export const BUOY_WITHIN_KM = 80

export interface BuoyPick {
  id: string
  name: string
  at: LatLon
  km: number
}

export function nearestBuoys(venue: LatLon, count = 3): BuoyPick[] {
  return NDBC_BUOYS.map(([id, lat, lon, name]) => ({ id, name, at: { lat, lon }, km: distanceMeters(venue, { lat, lon }) / 1000 }))
    .filter((b) => b.km <= BUOY_WITHIN_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, count)
}

export type BuoyReading =
  | { status: 'ok'; buoy: BuoyPick; at: Date; waveM: number; periodS: number | null; fromDeg: number | null }
  | { status: 'none'; reason: string }

/** The nearest buoy with a wave height lately, trying up to three. */
export async function latestBuoyWaves(venue: LatLon): Promise<BuoyReading> {
  const buoys = nearestBuoys(venue)
  if (buoys.length === 0) return { status: 'none', reason: `No NDBC buoy within ${BUOY_WITHIN_KM} km.` }
  for (const buoy of buoys) {
    try {
      const response = await fetch(BUOY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ station: buoy.id }) })
      reportNetwork(true)
      const body = (await response.json()) as { status?: string; at?: string; waveM?: number; periodS?: number | null; fromDeg?: number | null }
      if (body.status === 'ok' && typeof body.waveM === 'number' && typeof body.at === 'string') {
        return { status: 'ok', buoy, at: new Date(body.at), waveM: body.waveM, periodS: body.periodS ?? null, fromDeg: body.fromDeg ?? null }
      }
    } catch {
      reportNetwork(false)
      return { status: 'none', reason: "The buoy didn't load." }
    }
  }
  return { status: 'none', reason: 'The nearest buoys report no waves lately.' }
}

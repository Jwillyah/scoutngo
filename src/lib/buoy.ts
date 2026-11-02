/*
 * THE REAL CHECK ON THE SURF FORECAST: the nearest NDBC buoy's latest waves.
 *
 * The phone picks the buoy from the list baked into the app (src/data/ndbc.ts)
 * and sends only its number to api/buoy.ts, which reads NDBC's public file
 * (NDBC sends no CORS header, so a browser cannot read it directly). The
 * venue never leaves the phone for this.
 */
import { NDBC_BUOYS } from '../data/ndbc.ts'
import { bearingBetween, distanceMeters, type LatLon } from '../core/geo.ts'
import { reportNetwork } from './offlineCache.ts'

export const BUOY_ENDPOINT = '/api/buoy'
/*
 * WHICH BUOYS (Batch H, 2 Nov: match what Surfline shows near Virginia Beach,
 * 44099 Cape Henry, 44087 Thimble Shoal, 44014 offshore, 44100 and 44056 at
 * Duck). Within BUOY_WITHIN_KM, and on the water the beach faces: the bearing
 * from the venue to the buoy within SAME_WATER_DEG of the beach's facing
 * (src/lib/coast.ts). Thimble Shoal sits in the mouth of the Chesapeake, north-
 * west of an east-facing ocean beach, so it is left out there; from a beach
 * facing the bay it is the one. The nearest BUOYS_SHOWN of what is left.
 */
export const BUOY_WITHIN_KM = 150
export const SAME_WATER_DEG = 90
export const BUOYS_SHOWN = 3

export interface BuoyPick {
  id: string
  name: string
  at: LatLon
  km: number
}

const apart = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}

/** The nearest buoys facing the same water; with no facing known, the nearest. */
export function nearestBuoys(venue: LatLon, count = BUOYS_SHOWN, facingDeg: number | null = null): BuoyPick[] {
  return NDBC_BUOYS.map(([id, lat, lon, name]) => ({ id, name, at: { lat, lon }, km: distanceMeters(venue, { lat, lon }) / 1000 }))
    .filter((b) => b.km <= BUOY_WITHIN_KM)
    .filter((b) => facingDeg === null || apart(bearingBetween(venue, b.at), facingDeg) <= SAME_WATER_DEG)
    .sort((a, b) => a.km - b.km)
    .slice(0, count)
}

/** The swell and the wind waves apart, from the buoy's .spec file (api/buoy.ts). Null fields were missing there. */
export interface BuoySplit {
  swellM: number | null
  swellS: number | null
  swellFrom: string | null
  windWaveM: number | null
  windWaveS: number | null
  windWaveFrom: string | null
}

export type BuoyReading =
  | { status: 'ok'; buoy: BuoyPick; at: Date; waveM: number; periodS: number | null; fromDeg: number | null; split: BuoySplit | null }
  | { status: 'none'; reason: string }

interface BuoyBody {
  status?: string
  at?: string
  waveM?: number
  periodS?: number | null
  fromDeg?: number | null
  spec?: (BuoySplit & { at?: string }) | null
}

async function askBuoy(buoy: BuoyPick): Promise<BuoyReading | 'unreachable'> {
  try {
    const response = await fetch(BUOY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ station: buoy.id }) })
    reportNetwork(true)
    const body = (await response.json()) as BuoyBody
    if (body.status === 'ok' && typeof body.waveM === 'number' && typeof body.at === 'string') {
      const sp = body.spec ?? null
      const split =
        sp === null || (sp.swellM == null && sp.windWaveM == null)
          ? null
          : { swellM: sp.swellM ?? null, swellS: sp.swellS ?? null, swellFrom: sp.swellFrom ?? null, windWaveM: sp.windWaveM ?? null, windWaveS: sp.windWaveS ?? null, windWaveFrom: sp.windWaveFrom ?? null }
      return { status: 'ok', buoy, at: new Date(body.at), waveM: body.waveM, periodS: body.periodS ?? null, fromDeg: body.fromDeg ?? null, split }
    }
    return { status: 'none', reason: `Buoy ${buoy.id} reports no waves lately.` }
  } catch {
    reportNetwork(false)
    return 'unreachable'
  }
}

/** The chosen buoys' latest readings, each on its own; the ones with waves first, nearest first. */
export async function latestBuoys(venue: LatLon, facingDeg: number | null): Promise<BuoyReading[]> {
  const buoys = nearestBuoys(venue, BUOYS_SHOWN, facingDeg)
  if (buoys.length === 0) return [{ status: 'none', reason: `No NDBC buoy within ${BUOY_WITHIN_KM} km on this water.` }]
  const got = await Promise.all(buoys.map(askBuoy))
  if (got.every((g) => g === 'unreachable')) return [{ status: 'none', reason: "The buoy didn't load." }]
  const ok = got.filter((g): g is Extract<BuoyReading, { status: 'ok' }> => g !== 'unreachable' && g.status === 'ok')
  return ok.length > 0 ? ok : [{ status: 'none', reason: 'The nearest buoys report no waves lately.' }]
}

/** The nearest buoy with a wave height lately (the Surf page's check against the forecast). */
export async function latestBuoyWaves(venue: LatLon, facingDeg: number | null = null): Promise<BuoyReading> {
  return (await latestBuoys(venue, facingDeg))[0]
}

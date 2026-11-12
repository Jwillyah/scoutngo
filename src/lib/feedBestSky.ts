/*
 * THE BEST SPOT NEAR, FOR THE CALENDAR FEED (Batch BEST SKY, Section 6). The
 * feed's server (api/calendar.ts) has the venue rounded to 2 decimals; the
 * grid is laid round it rounded again to 0.05° (src/core/bestSky.ts), each
 * tile asked of Open-Meteo by its own 25 points, the same question the phone
 * asks. Only for events in the next day, so a refresh asks at most a
 * handful of tiles.
 */
import { getPosition } from 'suncalc'
import { bestSpotWords, gridTiles, rankSpots, scoreAt, scoreGrid, type SpotIn } from '../core/bestSky.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { STARTER_SPOTS } from '../data/bestSkySpots.ts'
import { readTile, tileUrl } from './bestSkyData.ts'
import { nearestHour } from './skyFireData.ts'

export const FEED_BEST_RADIUS_MI = 15
export const FEED_BEST_WITHIN_MS = 24 * 3_600_000

export async function feedBestSpot(at: LatLon, event: Date, now: Date, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (event.getTime() - now.getTime() > FEED_BEST_WITHIN_MS) return null
  const tiles = gridTiles(at, FEED_BEST_RADIUS_MI)
  const date = event.toISOString().slice(0, 10)
  const hour = nearestHour(event)
  const parts = await Promise.all(
    tiles.map(async (t) => {
      try {
        const r = await fetchImpl(tileUrl(t.points, date), { signal: AbortSignal.timeout(8000) })
        return r.ok ? readTile(await r.json(), t.points, hour) : null
      } catch {
        return null
      }
    }),
  )
  const points = parts.flatMap((p) => p ?? [])
  if (points.length === 0) return null
  const az = getPosition(event, at.lat, at.lon).azimuth
  const grid = scoreGrid(points, az)
  const rKm = FEED_BEST_RADIUS_MI * 1.609344
  const spots: SpotIn[] = STARTER_SPOTS.filter((s) => distanceMeters(at, s.at) / 1000 <= rKm)
  return bestSpotWords(rankSpots(grid, spots, az, at), scoreAt(grid, at), at, true)
}

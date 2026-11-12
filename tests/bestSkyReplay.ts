import { readFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { gridTiles, scoreGrid, type PointSky } from '../src/core/bestSky.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'
import { readTile } from '../src/lib/bestSkyData.ts'

/*
 * THE KEPT ANSWERS, REPLAYED (Batch BEST SKY): Open-Meteo's latest runs for
 * the hour, tile by tile (tests/data/bestsky-<date>/,
 * scripts/measure-bestsky-replay.mjs), and for 12 Nov the GOES-East frame
 * 20 min before sunrise. Shared by the section's tests.
 */
export const VB = { lat: 36.85, lon: -75.98 }
export const spot = (id: string) => STARTER_SPOTS.find((s) => s.id === id)!.at

export function eventOf(date: string, kind: 'sunrise' | 'sunset'): { at: Date; az: number } {
  const at = getTimes(new Date(`${date}T12:00:00Z`), VB.lat, VB.lon)[kind] as Date
  return { at, az: getPosition(at, VB.lat, VB.lon).azimuth }
}

export function replay(date: string, kind: 'sunrise' | 'sunset', sat: string | null) {
  const event = getTimes(new Date(`${date}T12:00:00Z`), VB.lat, VB.lon)[kind] as Date
  const hour = new Date(Math.round(event.getTime() / 3_600_000) * 3_600_000).toISOString().slice(0, 13) + ':00'
  const points: PointSky[] = []
  for (const t of gridTiles(VB, 15)) {
    const kept = JSON.parse(readFileSync(`tests/data/bestsky-${date}/tile-${t.spacing}-${t.south}-${t.west}.json`, 'utf8'))
    points.push(...(readTile(kept, t.points, hour) ?? []))
  }
  if (sat !== null) {
    const g = JSON.parse(readFileSync(`tests/data/bestsky-${date}/${sat}`, 'utf8')) as { c: (number | null)[] }
    const ground = Math.max(...g.c.filter((c): c is number => c !== null))
    g.c.forEach((c, i) => (points[i].satPatch = c === null ? null : c < ground - 12))
  }
  return scoreGrid(points, getPosition(event, VB.lat, VB.lon).azimuth)
}

/*
 * THE MAP'S SPOTS, FETCHED (Batch NOW, Section 0.4; arithmetic in
 * src/core/osmSpots.ts). One Overpass question per fixed 0.25° tile, through
 * the app's one Overpass queue (src/lib/overpassClient.ts), never the spot;
 * each answer kept a week in Cache Storage (map data, nothing about you).
 * Only to 30 mi, at most OSM_TILE_CAP tiles: Overpass is a shared, free
 * service.
 */
import { osmQuery, osmSpots, osmTiles, type OsmTile } from '../core/osmSpots.ts'
import type { SpotIn } from '../core/bestSky.ts'
import type { LatLon } from '../core/geo.ts'
import { askOverpass } from './overpassClient.ts'

export const OSM_CACHE = 'scoutngo-osm-spots-v1'
export const OSM_KEEP_MS = 7 * 86_400_000
export const OSM_TILE_CAP = 16
export const OSM_MAX_RADIUS_KM = 30 * 1.609344

const memory = new Map<string, SpotIn[]>()
/* The cache's key, on this app's own origin: never asked for, only a name for the kept answer. */
const keyOf = (t: OsmTile) => `/__osm-spots/${t.south},${t.west}`

async function kept(t: OsmTile): Promise<SpotIn[] | null> {
  const hit = memory.get(keyOf(t))
  if (hit !== undefined) return hit
  try {
    const r = await (await caches.open(OSM_CACHE)).match(keyOf(t))
    if (r === undefined) return null
    const body = (await r.json()) as { at: number; spots: SpotIn[] }
    if (Date.now() - body.at > OSM_KEEP_MS) return null
    memory.set(keyOf(t), body.spots)
    return body.spots
  } catch {
    return null
  }
}

async function keep(t: OsmTile, spots: SpotIn[]): Promise<void> {
  memory.set(keyOf(t), spots)
  try {
    await (await caches.open(OSM_CACHE)).put(keyOf(t), new Response(JSON.stringify({ at: Date.now(), spots }), { headers: { 'content-type': 'application/json' } }))
  } catch {
    /* No Cache Storage (a private window): the memory copy for this session. */
  }
}

/** The map's spots within the radius's tiles; [] past 30 mi, offline, or when Overpass does not answer. */
export async function fetchOsmSpots(centre: LatLon, radiusKm: number): Promise<{ spots: SpotIn[]; asked: number }> {
  if (radiusKm > OSM_MAX_RADIUS_KM) return { spots: [], asked: 0 }
  const tiles = osmTiles(centre, radiusKm).slice(0, OSM_TILE_CAP)
  let asked = 0
  const parts = await Promise.all(
    tiles.map(async (t) => {
      const have = await kept(t)
      if (have !== null) return have
      asked += 1
      const got = await askOverpass(osmQuery(t), { budgetMs: 30_000 })
      if (!got.ok) return []
      const spots = osmSpots(got.payload)
      await keep(t, spots)
      return spots
    }),
  )
  return { spots: parts.flat(), asked }
}

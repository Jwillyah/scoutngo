/*
 * WHERE THE SEA IS AROUND A VENUE, FROM THE MAP TILES, AND WHICH WAY THE BEACH
 * FACES (src/core/coastFacing.ts, worked out two ways).
 *
 * The ocean polygons are OpenFreeMap's `water` layer, class `ocean`, the same
 * tiles the 3D view and the terrain cleanup already read (src/lib/vectorTiles.ts,
 * cached on the phone). Zoom 12 tiles: about 8 km across here, so a 1.5 km
 * circle touches at most four.
 */
import { CIRCLE_M, facingByCircle, facingByNearest, oceanSide, opensOnSea, OPEN_SEA_KM } from '../core/coastFacing.ts'
import { destinationPoint, distanceMeters, type LatLon } from '../core/geo.ts'
import { SURF_SPOTS } from '../data/surfSpots.ts'
import type { TilePoint } from '../core/oceanMask.ts'
import { boxAround, tileAt, tilesInBox } from './tileRange.ts'

export const COAST_ZOOM = 12

export interface CoastFacing {
  /** The facing shown: the circle method's, else the nearest-sea method's. */
  facing: number
  byCircle: number | null
  byNearest: number | null
  /**
   * Batch Beach, Section 1: 'open' when the facing goes on to open sea;
   * 'island' when the venue was on a barrier island's sound side and the
   * facing is its ocean side's, read at `beachAt`; 'enclosed' when the water
   * is a sound or bay with no open ocean across from it.
   */
  side?: 'open' | 'island' | 'enclosed'
  /** The ocean beach the facing is read at: the venue, or across the island. */
  beachAt?: LatLon
}

/** Far out, the coarse tiles: zoom 7, about 250 km across here: Pamlico Sound runs 70 km and more from the barrier islands, the open sea does not end. */
export const OPEN_ZOOM = 7

interface Loaded {
  x: number
  y: number
  extent: number
  rings: TilePoint[][]
}

function inRings(rings: TilePoint[][], px: number, py: number): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]
      const b = ring[j]
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
  }
  return inside
}

/** A sea test over the tiles around `venue`, or null when the tiles cannot be had. */
export async function seaTestAround(venue: LatLon, radiusM = CIRCLE_M + 200, zoom = COAST_ZOOM): Promise<((at: LatLon) => boolean) | null> {
  const ids = tilesInBox(boxAround(venue, radiusM), zoom)
  /* Batch Beach, Section 4: the tile reader (and its protobuf parser) is asked for here, not with the home. */
  const { loadVectorTile, oceanFeatures, vectorExtent } = await import('./vectorTiles.ts')
  const loaded: Loaded[] = []
  for (const id of ids) {
    const tile = await loadVectorTile({ z: zoom, x: id.x, y: id.y })
    if (tile === null) return null
    /* Each feature's rings by the even-odd rule: a hole is a hole. A tile with no ocean adds nothing: all land. */
    const extent = vectorExtent(tile)
    for (const rings of oceanFeatures(tile)) loaded.push({ x: id.x, y: id.y, extent, rings })
  }
  const n = 2 ** zoom
  return (at: LatLon) => {
    const t = tileAt(at, zoom)
    const s = Math.sin((at.lat * Math.PI) / 180)
    const fx = ((at.lon + 180) / 360) * n - t.x
    const fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - t.y
    return loaded.some((f) => f.x === t.x && f.y === t.y && inRings(f.rings, fx * f.extent, fy * f.extent))
  }
}

/**
 * Which way the beach faces; 'inland' when no sea is within CIRCLE_M; 'unavailable'
 * when the tiles cannot be had, which is not the same as no sea.
 */
/** A point this close to one of our surf spots is that spot: its own ocean beach and facing (Batch Beach, Section 1). */
export const SPOT_SNAP_M = 500

export async function coastFacing(venue: LatLon): Promise<CoastFacing | 'inland' | 'unavailable'> {
  const spot = SURF_SPOTS.find((s) => distanceMeters(venue, s.at) <= SPOT_SNAP_M)
  if (spot !== undefined) return { facing: spot.facing, byCircle: null, byNearest: null, side: 'open', beachAt: spot.at }
  const sea = await seaTestAround(venue)
  if (sea === null) return 'unavailable'
  const byCircle = facingByCircle(venue, sea)
  const byNearest = facingByNearest(venue, sea)
  const facing = byCircle ?? byNearest
  if (facing === null) return 'inland'
  /* Batch Beach, Section 1: is it the open sea, or a sound? The far tiles, once; without them the facing stands as read. */
  const far = await seaTestAround(venue, (OPEN_SEA_KM[OPEN_SEA_KM.length - 1] + 5) * 1000, OPEN_ZOOM)
  if (far === null || opensOnSea(venue, facing, far)) return { facing, byCircle, byNearest, side: 'open', beachAt: venue }
  const across = oceanSide(venue, facing, sea, far)
  if (across === null) return { facing, byCircle, byNearest, side: 'enclosed', beachAt: venue }
  /* At the ocean beach, the nearest water is the ocean: its facing, by the same walk. */
  const there = await seaTestAround(across.beachAt)
  const oceanFacing = (there === null ? null : facingByNearest(across.beachAt, there)) ?? across.bearing
  return { facing: oceanFacing, byCircle: null, byNearest: oceanFacing, side: 'island', beachAt: across.beachAt }
}

/** Metres from the venue to the nearest sea along any bearing, within `withinM`, or null. Phase 1b's coastal test. */
export async function metresToSea(venue: LatLon, withinM: number): Promise<number | null> {
  const m = await seaReach(venue, withinM)
  return m === 'unavailable' ? null : m
}

/**
 * The same, but saying so when the tiles could not be had: 'unavailable' is
 * not "no sea". Offline, a pier is still on the coast (field test, 30 Oct;
 * src/lib/placeMemory.ts keeps the last answer per venue for exactly this).
 */
export async function seaReach(venue: LatLon, withinM: number): Promise<number | null | 'unavailable'> {
  const sea = await seaTestAround(venue, withinM + 200)
  if (sea === null) return 'unavailable'
  if (sea(venue)) return 0
  let best: number | null = null
  for (let b = 0; b < 360; b += 4) {
    for (let m = 50; m <= withinM && (best === null || m < best); m += 50) {
      if (sea(destinationPoint(venue, b, m))) {
        best = m
        break
      }
    }
  }
  return best
}

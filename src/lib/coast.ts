/*
 * WHERE THE SEA IS AROUND A VENUE, FROM THE MAP TILES, AND WHICH WAY THE BEACH
 * FACES (src/core/coastFacing.ts, worked out two ways).
 *
 * The ocean polygons are OpenFreeMap's `water` layer, class `ocean`, the same
 * tiles the 3D view and the terrain cleanup already read (src/lib/vectorTiles.ts,
 * cached on the phone). Zoom 12 tiles: about 8 km across here, so a 1.5 km
 * circle touches at most four.
 */
import { CIRCLE_M, facingByCircle, facingByNearest } from '../core/coastFacing.ts'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import type { TilePoint } from '../core/oceanMask.ts'
import { boxAround, tileAt, tilesInBox } from './tileRange.ts'
import { loadVectorTile, oceanFeatures, vectorExtent } from './vectorTiles.ts'

export const COAST_ZOOM = 12

export interface CoastFacing {
  /** The facing shown: the circle method's, else the nearest-sea method's. */
  facing: number
  byCircle: number | null
  byNearest: number | null
}

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
export async function seaTestAround(venue: LatLon, radiusM = CIRCLE_M + 200): Promise<((at: LatLon) => boolean) | null> {
  const ids = tilesInBox(boxAround(venue, radiusM), COAST_ZOOM)
  const loaded: Loaded[] = []
  for (const id of ids) {
    const tile = await loadVectorTile({ z: COAST_ZOOM, x: id.x, y: id.y })
    if (tile === null) return null
    /* Each feature's rings by the even-odd rule: a hole is a hole. A tile with no ocean adds nothing: all land. */
    const extent = vectorExtent(tile)
    for (const rings of oceanFeatures(tile)) loaded.push({ x: id.x, y: id.y, extent, rings })
  }
  const n = 2 ** COAST_ZOOM
  return (at: LatLon) => {
    const t = tileAt(at, COAST_ZOOM)
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
export async function coastFacing(venue: LatLon): Promise<CoastFacing | 'inland' | 'unavailable'> {
  const sea = await seaTestAround(venue)
  if (sea === null) return 'unavailable'
  const byCircle = facingByCircle(venue, sea)
  const byNearest = facingByNearest(venue, sea)
  const facing = byCircle ?? byNearest
  return facing === null ? 'inland' : { facing, byCircle, byNearest }
}

/** Metres from the venue to the nearest sea along any bearing, within `withinM`, or null. Phase 1b's coastal test. */
export async function metresToSea(venue: LatLon, withinM: number): Promise<number | null> {
  const sea = await seaTestAround(venue, withinM + 200)
  if (sea === null) return null
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

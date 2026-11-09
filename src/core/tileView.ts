/*
 * A SMALL STATIC MAP FROM A FEW TILES (Batch N, Section 4: the Buoys page's
 * map card). Pure Web Mercator arithmetic: which zoom holds every point in a
 * box of w x h pixels, where each point lands in it, and which 256 px tiles
 * the box needs, never more than tileCap of them.
 */
import type { LatLon } from './geo.ts'

export const TILE_PX = 256
const MAX_LAT = 85.051129

/** A point's position in world pixels at zoom z (x east from the antimeridian, y south from the top). */
export function worldPx(p: LatLon, z: number): { x: number; y: number } {
  const size = TILE_PX * 2 ** z
  const lat = (Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat)) * Math.PI) / 180
  return {
    x: ((p.lon + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * size,
  }
}

export interface TileView {
  z: number
  /** World pixel of the box's top-left corner at zoom z. */
  left: number
  top: number
  width: number
  height: number
}

export interface ViewTile {
  z: number
  x: number
  y: number
  /** Where the tile's top-left corner sits in the box, pixels. */
  dx: number
  dy: number
}

/** Every tile the box touches (columns wrap round the antimeridian; rows off the world are left out). */
export function viewTiles(view: TileView): ViewTile[] {
  const n = 2 ** view.z
  const out: ViewTile[] = []
  const x0 = Math.floor(view.left / TILE_PX)
  const x1 = Math.floor((view.left + view.width - 1) / TILE_PX)
  const y0 = Math.floor(view.top / TILE_PX)
  const y1 = Math.floor((view.top + view.height - 1) / TILE_PX)
  for (let ty = y0; ty <= y1; ty += 1) {
    if (ty < 0 || ty >= n) continue
    for (let tx = x0; tx <= x1; tx += 1) {
      out.push({ z: view.z, x: ((tx % n) + n) % n, y: ty, dx: tx * TILE_PX - view.left, dy: ty * TILE_PX - view.top })
    }
  }
  return out
}

/**
 * The closest zoom, from maxZoom down to minZoom, at which every point fits in
 * the box with padPx to spare on each side and the box needs at most tileCap
 * tiles; centred on the points. Null for no points.
 */
export function fitView(points: readonly LatLon[], width: number, height: number, padPx: number, minZoom: number, maxZoom: number, tileCap: number): TileView | null {
  if (points.length === 0) return null
  let last: TileView | null = null
  for (let z = maxZoom; z >= minZoom; z -= 1) {
    const px = points.map((p) => worldPx(p, z))
    const xs = px.map((p) => p.x)
    const ys = px.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const view = { z, left: (minX + maxX) / 2 - width / 2, top: (minY + maxY) / 2 - height / 2, width, height }
    last = view
    if (maxX - minX <= width - 2 * padPx && maxY - minY <= height - 2 * padPx && viewTiles(view).length <= tileCap) return view
  }
  return last
}

/** Where a point lands in the box, pixels from its top-left corner. */
export function inView(view: TileView, p: LatLon): { x: number; y: number } {
  const w = worldPx(p, view.z)
  return { x: w.x - view.left, y: w.y - view.top }
}

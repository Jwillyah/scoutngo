/*
 * THE NAMES IN VIEW (Batch Map, Section 3), from OpenFreeMap's vector tiles
 * (the OpenMapTiles schema): `place` (towns), `water_name` (seas, sounds,
 * bays) and `transportation_name` (roads). Read through the same tile loader
 * the sea and the buildings use (src/lib/vectorTiles.ts), so a saved area's
 * tiles work offline. Only the tiles in view are asked: a map cell, like any
 * map tile.
 */
import type { VectorTileFeature } from '@mapbox/vector-tile'
import { placeKind, type LabelCandidate } from '../core/mapLabels.ts'
import { tilePointLonLat, type TileAddress } from '../core/seaTile.ts'
import { loadVectorTile } from './vectorTiles.ts'

export const LABEL_TILE_MAX_Z = 14

/** The tiles covering a box at a zoom, at most `max` (the nearest the middle first). */
export function tilesFor(b: { south: number; west: number; north: number; east: number }, zoom: number, max = 9): TileAddress[] {
  const z = Math.max(2, Math.min(LABEL_TILE_MAX_Z, Math.floor(zoom)))
  const n = 2 ** z
  const tx = (lon: number) => Math.max(0, Math.min(n - 1, Math.floor(((lon + 180) / 360) * n)))
  const ty = (lat: number) => Math.max(0, Math.min(n - 1, Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n)))
  const out: TileAddress[] = []
  for (let x = tx(b.west); x <= tx(b.east); x += 1) for (let y = ty(b.north); y <= ty(b.south); y += 1) out.push({ z, x, y })
  const cx = (tx(b.west) + tx(b.east)) / 2
  const cy = (ty(b.north) + ty(b.south)) / 2
  return out.sort((a, c) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(c.x - cx, c.y - cy)).slice(0, max)
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : null)

/** A feature's label point: the point itself, or the middle of a line's longest part. */
function anchor(f: VectorTileFeature): { x: number; y: number } | null {
  const g = f.loadGeometry()
  const line = g.reduce((a, b) => (b.length > a.length ? b : a), g[0] ?? [])
  return line.length === 0 ? null : line[Math.floor(line.length / 2)]
}

export function candidatesIn(tile: { layers: Record<string, { length: number; extent: number; feature: (i: number) => VectorTileFeature }> }, at: TileAddress): LabelCandidate[] {
  const out: LabelCandidate[] = []
  const read = (layer: string, make: (p: Record<string, unknown>) => Omit<LabelCandidate, 'lat' | 'lon'> | null) => {
    const l = tile.layers[layer]
    if (l === undefined) return
    for (let i = 0; i < l.length; i += 1) {
      const f = l.feature(i)
      const base = make(f.properties as Record<string, unknown>)
      if (base === null) continue
      const p = anchor(f)
      if (p === null) continue
      const { lat, lon } = tilePointLonLat(at, p.x / l.extent, p.y / l.extent)
      out.push({ ...base, lat, lon })
    }
  }
  read('place', (p) => {
    const kind = placeKind(str(p.class))
    const name = str(p['name:latin']) || str(p.name)
    return kind === null || name === '' ? null : { name, kind, rank: num(p.rank) }
  })
  read('water_name', (p) => {
    const name = str(p['name:latin']) || str(p.name)
    return name === '' ? null : { name, kind: 'water', rank: num(p.rank) }
  })
  read('transportation_name', (p) => {
    const name = str(p.name)
    return name === '' ? null : { name, kind: 'road', rank: null, roadClass: str(p.class) }
  })
  return out
}

export async function labelCandidates(b: { south: number; west: number; north: number; east: number }, zoom: number): Promise<LabelCandidate[]> {
  const tiles = tilesFor(b, zoom)
  const got = await Promise.all(tiles.map(async (t) => {
    const v = await loadVectorTile(t).catch(() => null)
    return v === null ? [] : candidatesIn(v as never, t)
  }))
  return got.flat()
}

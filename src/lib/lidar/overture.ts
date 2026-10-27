/*
 * OUTSIDE THE LIDAR: HEIGHTS FROM OVERTURE MAPS, AFTER A TAP.
 *
 * Overture's buildings as PMTiles (overturemaps-extras-us-west-2, release
 * OVERTURE_RELEASE), read straight from the phone with byte ranges, no
 * account (CORS allows it: checked 27 Oct 2026). Most of Overture's heights
 * are OpenStreetMap's, which the map tiles already carry; what it adds is
 * Esri Community Maps' heights. Microsoft's ML heights are a model's
 * estimate, and a shadow from an estimate is invented shade, so they are not
 * used. At the pier's tile: 16 Esri, 9 Microsoft ML, 1147 OSM, of 1764.
 */
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { PMTiles } from 'pmtiles'
import type { Building } from '../buildings.ts'
import { tileAt } from '../tileRange.ts'

export const OVERTURE_RELEASE = '2026-10-21.0'
export const OVERTURE_URL = `https://overturemaps-extras-us-west-2.s3.amazonaws.com/tiles/${OVERTURE_RELEASE}/buildings.pmtiles`
const USED = new Set(['Esri Community Maps'])
const KEY = (areaId: string) => `scoutngo.overture.${areaId}.v1`

export interface OvertureHeights {
  release: string
  savedAt: string
  /** By map-tile building id: metres, and whose height it is. */
  heights: Record<string, { metres: number; source: string }>
}

function inRing(ring: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** Fetches the zoom 14 tiles under `buildings` and matches each footprint's centre to an Overture building with a usable height. */
export async function fetchOvertureHeights(buildings: readonly Building[], areaId: string): Promise<OvertureHeights> {
  const pm = new PMTiles(OVERTURE_URL)
  const z = 14
  const byTile = new Map<string, Building[]>()
  for (const b of buildings) {
    const lon = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length
    const lat = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length
    const t = tileAt({ lat, lon }, z)
    const k = `${t.x}/${t.y}`
    byTile.set(k, [...(byTile.get(k) ?? []), b])
  }
  const heights: OvertureHeights['heights'] = {}
  for (const [k, list] of byTile) {
    const [x, y] = k.split('/').map(Number)
    const got = await pm.getZxy(z, x, y)
    if (got === undefined) continue
    const layer = new VectorTile(new PbfReader(new Uint8Array(got.data))).layers.building
    if (layer === undefined) continue
    const shapes: { ring: { x: number; y: number }[]; metres: number; source: string }[] = []
    for (let i = 0; i < layer.length; i += 1) {
      const f = layer.feature(i)
      const h = Number(f.properties.height)
      const source = String(f.properties['@height_source'] ?? '')
      if (!Number.isFinite(h) || h <= 0 || !USED.has(source)) continue
      for (const ring of f.loadGeometry()) shapes.push({ ring: ring.map((p) => ({ x: p.x, y: p.y })), metres: h, source })
    }
    const n = 2 ** z
    const extent = layer.extent
    for (const b of list) {
      const lon = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length
      const lat = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length
      const s = Math.sin((lat * Math.PI) / 180)
      const px = (((lon + 180) / 360) * n - x) * extent
      const py = ((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - y) * extent
      const hit = shapes.find((sh) => inRing(sh.ring, px, py))
      if (hit !== undefined) heights[b.id] = { metres: hit.metres, source: hit.source }
    }
  }
  const out = { release: OVERTURE_RELEASE, savedAt: new Date().toISOString(), heights }
  try {
    localStorage.setItem(KEY(areaId), JSON.stringify(out))
  } catch {
    /* Not kept: this session still has them. */
  }
  return out
}

export function readOvertureHeights(areaId: string): OvertureHeights | null {
  try {
    const raw = localStorage.getItem(KEY(areaId))
    return raw === null ? null : (JSON.parse(raw) as OvertureHeights)
  } catch {
    return null
  }
}

/** Fills a footprint's height from Overture only where the map has none. */
export function applyOverture(buildings: readonly Building[], o: OvertureHeights): Building[] {
  return buildings.map((b) => {
    const h = o.heights[b.id]
    if (h === undefined || b.height.metres !== null) return b
    return { ...b, height: { ...b.height, metres: h.metres, drawMetres: h.metres, source: 'overture', overtureSource: h.source } }
  })
}

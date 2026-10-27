/*
 * MAPPED TREES, FOR THE 3D VIEW.
 *
 * Single trees (natural=tree nodes) only, drawn as rounded clay-green
 * shapes. Woods and forest polygons are not: a polygon says trees are there,
 * not where or how tall, and filling one with invented trees would draw a
 * skyline nobody measured.
 *
 * SPARSE MEANS NONE. Under SPARSE_TREES mapped trees in the box, none are
 * drawn and the legend says so: a handful drawn among many that are really
 * there would read as open ground. Counted at the example venue by
 * scripts/measure-trees.mjs.
 */
import { boxAround } from './tileRange.ts'
import type { LatLon } from '../core/geo.ts'

export const TREE_BOX_METERS = 700
export const SPARSE_TREES = 25
/** Drawn when OSM gives no height: a nominal crown, for the picture only, like NOMINAL_DRAW_HEIGHT. */
export const NOMINAL_TREE_HEIGHT = 8

export interface MappedTree {
  at: LatLon
  /** Metres, when OSM says. */
  height: number | null
}

export function treesQuery(at: LatLon): string {
  const b = boxAround(at, TREE_BOX_METERS)
  const bbox = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:25];
(
  node["natural"="tree"](${bbox});
  way["natural"="tree_row"](${bbox});
  way["natural"="wood"](${bbox});
  way["landuse"="forest"](${bbox});
);
out tags center;`
}

export function parseTrees(payload: unknown): MappedTree[] {
  const elements = (payload as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elements)) return []
  const out: MappedTree[] = []
  for (const e of elements as { type?: string; lat?: number; lon?: number; tags?: Record<string, string> }[]) {
    if (e.type !== 'node' || e.tags?.natural !== 'tree' || typeof e.lat !== 'number' || typeof e.lon !== 'number') continue
    const h = Number.parseFloat(e.tags?.height ?? '')
    out.push({ at: { lat: e.lat, lon: e.lon }, height: Number.isFinite(h) && h > 0 && h < 120 ? h : null })
  }
  return out
}

/** Fetched with the rest of the place, in one request (place.ts). */
export type TreesResult = { status: 'drawn'; trees: MappedTree[] } | { status: 'sparse'; count: number } | { status: 'unavailable' }

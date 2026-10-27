/*
 * READING A USGS ENTWINE POINT TILES PROJECT: which point tiles cover a venue's
 * patch, how deep to go for the density asked for, and how big that is,
 * worked out before anything is downloaded.
 *
 * EPT keeps the points in an octree: depth 0 is one tile over the whole
 * project, and each depth down halves the tile and adds points. The tile
 * index (ept-hierarchy) gives every tile's point count, so the density at
 * each depth over the patch is known in advance: a tile contributes its count
 * times the share of it inside the patch (points are spread across a tile,
 * so the share is the estimate).
 */
import { areaM2, overlap, type LidarArea, type MercatorBox } from './grid.ts'

export const LIDAR_BUCKET = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public'
/* The default density, points per square metre on the ground, and the high-detail one. */
export const DENSITY_DEFAULT = 2
export const DENSITY_HIGH = 8

export interface EptMeta {
  bounds: [number, number, number, number, number, number]
  points: number
  srs?: { horizontal?: string; vertical?: string; wkt?: string }
}

export interface EptNode {
  key: string
  depth: number
  /** Points in the whole tile. */
  count: number
  box: MercatorBox
  /** Points expected inside the patch: count x the share of the tile inside it. */
  inside: number
}

export type Hierarchy = (key: string) => Promise<Record<string, number>>

/** Every tile that touches the patch, to `maxDepth`. */
export async function nodesFor(meta: EptMeta, area: MercatorBox, hierarchy: Hierarchy, maxDepth = 14): Promise<EptNode[]> {
  const [x0, y0, , x1] = meta.bounds
  const counts = new Map<string, number>()
  const load = async (key: string) => {
    for (const [k, v] of Object.entries(await hierarchy(key))) counts.set(k, v)
  }
  await load('0-0-0-0')
  const out: EptNode[] = []
  const visit = async (d: number, x: number, y: number, z: number): Promise<void> => {
    const key = `${d}-${x}-${y}-${z}`
    let count = counts.get(key)
    if (count === undefined) return
    if (count === -1) {
      await load(key)
      count = counts.get(key)
      if (count === undefined || count === -1) return
    }
    const size = (x1 - x0) / 2 ** d
    const box = { minx: x0 + x * size, miny: y0 + y * size, maxx: x0 + (x + 1) * size, maxy: y0 + (y + 1) * size }
    const share = overlap(box, area)
    if (share === 0) return
    out.push({ key, depth: d, count, box, inside: count * share })
    if (d >= maxDepth) return
    for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) await visit(d + 1, 2 * x + dx, 2 * y + dy, 2 * z + dz)
  }
  await visit(0, 0, 0, 0)
  return out
}

export interface DepthPick {
  depth: number
  /** Expected points per square metre on the ground at that depth. */
  density: number
  nodes: EptNode[]
  points: number
}

/** The shallowest depth whose points reach `target` per m², or the deepest there is. */
export function pickDepth(nodes: EptNode[], area: LidarArea, target: number): DepthPick {
  const m2 = areaM2(area, area.metresPerUnit)
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  let pick: DepthPick = { depth: 0, density: 0, nodes: [], points: 0 }
  for (let d = 0; d <= maxDepth; d += 1) {
    const upTo = nodes.filter((n) => n.depth <= d)
    const points = upTo.reduce((s, n) => s + n.inside, 0)
    pick = { depth: d, density: points / m2, nodes: upTo, points }
    if (pick.density >= target) break
  }
  return pick
}

/** Bytes to download: every chosen tile is fetched whole; `bytesPerPoint` measured from the project. */
export const estimateBytes = (nodes: EptNode[], bytesPerPoint: number): number => nodes.reduce((s, n) => s + n.count * bytesPerPoint, 0)

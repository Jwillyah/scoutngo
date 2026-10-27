/*
 * A BUILDING'S HEIGHT FROM THE SCAN, TWO WAYS (the double-math rule):
 *
 *   byPoints   the 95th percentile of the roof returns inside the footprint,
 *              minus the ground (the median of the DTM cells under it). Roof
 *              returns are every return that is not ground, water or noise
 *              and stands ROOF_ABOVE_M over the ground: the USGS projects at
 *              both venues classify ground and water only, so buildings are
 *              in class 1, "unclassified" (measurements/2026-10-27-lidar-scan.md).
 *              The 95th, not the top, so an antenna or a bird does not make
 *              the roof.
 *   byRaster   the 95th percentile of the DSM cells inside the footprint,
 *              minus the same ground. A different sample of the same roof
 *              (first returns of every class, gridded), so the two meet
 *              within HEIGHT_AGREE_M on an ordinary roof and part company
 *              only where something is wrong.
 *
 * A footprint inside the scan with no roof returns at all is newer than the
 * scan (or was not a building then): said, not guessed.
 */
import type { Rasters } from './raster.ts'
import { cellIndex, STRIDE } from './raster.ts'

export const HEIGHT_AGREE_M = 1.5
/* Fewer roof returns than this and the footprint is called newer than the scan. */
export const MIN_ROOF_POINTS = 4
/* A return this far over the ground inside a footprint is roof, not ground clutter. */
export const ROOF_ABOVE_M = 1.5
const NOT_ROOF = new Set([2, 7, 9, 18])

export type ScanHeight =
  | { kind: 'measured'; metres: number; byRaster: number; points: number }
  | { kind: 'newer-than-scan' }
  | { kind: 'outside-scan' }

const pct = (values: number[], p: number): number => {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]
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

/** `ring` in Web Mercator. */
export function scanHeight(ring: readonly { x: number; y: number }[], points: Float64Array, r: Rasters): ScanHeight {
  let minx = Infinity
  let maxx = -Infinity
  let miny = Infinity
  let maxy = -Infinity
  for (const p of ring) {
    minx = Math.min(minx, p.x)
    maxx = Math.max(maxx, p.x)
    miny = Math.min(miny, p.y)
    maxy = Math.max(maxy, p.y)
  }
  if (cellIndex(r, minx, miny) < 0 || cellIndex(r, maxx, maxy) < 0) return { kind: 'outside-scan' }
  const ground: number[] = []
  const surface: number[] = []
  for (let y = maxy; y >= miny; y -= r.cell) {
    for (let x = minx; x <= maxx; x += r.cell) {
      if (!inRing(ring, x, y)) continue
      const i = cellIndex(r, x, y)
      if (i < 0) continue
      ground.push(r.dtm[i])
      surface.push(r.dsm[i])
    }
  }
  const groundZ = ground.length > 0 ? pct(ground, 0.5) : null
  const roof: number[] = []
  for (let p = 0; p + STRIDE <= points.length; p += STRIDE) {
    const x = points[p]
    const y = points[p + 1]
    if (NOT_ROOF.has(points[p + 3]) || x < minx || x > maxx || y < miny || y > maxy) continue
    if (groundZ !== null && points[p + 2] - groundZ < ROOF_ABOVE_M) continue
    if (inRing(ring, x, y)) roof.push(points[p + 2])
  }
  if (roof.length < MIN_ROOF_POINTS) return { kind: 'newer-than-scan' }
  const base = groundZ ?? pct(roof, 0)
  const byPoints = pct(roof, 0.95) - base
  const byRaster = surface.length > 0 ? pct(surface, 0.95) - base : byPoints
  return { kind: 'measured', metres: Math.max(0, byPoints), byRaster: Math.max(0, byRaster), points: roof.length }
}

/*
 * FROM THE RASTERS ALONE, for a footprint the download did not see (no points
 * are kept on the phone): the surface's 95th percentile minus the ground's
 * median, if at least MIN_ROOF_POINTS cells stand ROOF_ABOVE_M over it.
 */
export function rasterHeight(ring: readonly { x: number; y: number }[], r: Rasters): ScanHeight {
  let minx = Infinity
  let maxx = -Infinity
  let miny = Infinity
  let maxy = -Infinity
  for (const p of ring) {
    minx = Math.min(minx, p.x)
    maxx = Math.max(maxx, p.x)
    miny = Math.min(miny, p.y)
    maxy = Math.max(maxy, p.y)
  }
  if (cellIndex(r, minx, miny) < 0 || cellIndex(r, maxx, maxy) < 0) return { kind: 'outside-scan' }
  const ground: number[] = []
  const surface: number[] = []
  for (let y = maxy; y >= miny; y -= r.cell) {
    for (let x = minx; x <= maxx; x += r.cell) {
      if (!inRing(ring, x, y)) continue
      const i = cellIndex(r, x, y)
      if (i < 0) continue
      ground.push(r.dtm[i])
      surface.push(r.dsm[i])
    }
  }
  if (ground.length === 0) return { kind: 'newer-than-scan' }
  const base = pct(ground, 0.5)
  if (surface.filter((z) => z - base >= ROOF_ABOVE_M).length < MIN_ROOF_POINTS) return { kind: 'newer-than-scan' }
  const h = Math.max(0, pct(surface, 0.95) - base)
  return { kind: 'measured', metres: h, byRaster: h, points: 0 }
}

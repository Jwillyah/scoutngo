/*
 * THE SCAN'S GROUND IN THE 3D VIEW: a terrain tile's height samples, with
 * every sample inside the scanned patch replaced by the lidar ground (the
 * DTM) at that spot. Outside the patch the Terrarium heights stand; the two
 * agree within 0.12 m on the beach at the pier and 0.27 m at Brew River
 * (measurements/2026-10-27-lidar-stop.md), so the seam is a step of a few
 * centimetres, not a cliff.
 */
import { cellIndex, type Rasters } from './raster.ts'

const HALF = Math.PI * 6378137

export function overlayDtm(grid: Float32Array, n: number, tile: { x: number; y: number; z: number }, r: Rasters): number {
  const size = (2 * HALF) / 2 ** tile.z
  let replaced = 0
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = -HALF + (tile.x + i / (n - 1)) * size
      const y = HALF - (tile.y + j / (n - 1)) * size
      const c = cellIndex(r, x, y)
      if (c < 0 || Number.isNaN(r.dtm[c])) continue
      grid[j * n + i] = r.dtm[c]
      replaced += 1
    }
  }
  return replaced
}

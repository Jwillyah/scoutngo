/*
 * THE SCAN'S GROUND IN THE 3D VIEW: a terrain tile's height samples, with
 * every sample inside the scanned patch replaced by the lidar ground (the
 * DTM) at that spot. Outside the patch the Terrarium heights stand; the two
 * agree within 0.12 m on the beach at the pier and 0.27 m at Brew River
 * (measurements/2026-10-27-lidar-stop.md), so the seam is a step of a few
 * centimetres, not a cliff.
 */
import { nearGround } from '../../core/waterline.ts'
import { cellIndex, KIND, type Rasters } from './raster.ts'

/*
 * THE SEA FLOOR IN 3D. The elevation tiles have the sea put at exactly 0 m
 * (src/lib/seaMask.ts), which is fine for a map but stands above the water at
 * low tide: 0 m NAVD88 is above the low water at the pier (-0.84 m at the
 * 2013 flight). In the 3D view a sample of exactly 0 is put this far down,
 * below any tide, so the drawn water meets the real beach. Land at exactly
 * 0.000 m is a 1-in-256-cm coincidence the tiles' quantising rarely makes.
 */
export const SEA_FLOOR_M = -3

export function lowerSea(grid: Float32Array): number {
  let n = 0
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] === 0) {
      grid[i] = SEA_FLOOR_M
      n += 1
    }
  }
  return n
}

/* Measured ground, per scan: cells with ground returns or one cell from one (the waterline's rule); a scan kept before the mask, what is not water on top. */
const measuredCache = new WeakMap<Rasters, Uint8Array>()
function measuredOf(r: Rasters): Uint8Array {
  let m = measuredCache.get(r)
  if (m === undefined) {
    m = r.ground !== undefined ? nearGround(r.ground, r.width, r.height) : Uint8Array.from(r.kind, (k) => (k !== KIND.water && k !== KIND.none ? 1 : 0))
    measuredCache.set(r, m)
  }
  return m
}

const HALF = Math.PI * 6378137

/** Only where the scan measured ground: under the water it saw none, and its filled-in sea would stand as a flat plain above low water. */
export function overlayDtm(grid: Float32Array, n: number, tile: { x: number; y: number; z: number }, r: Rasters): number {
  const measured = measuredOf(r)
  const size = (2 * HALF) / 2 ** tile.z
  let replaced = 0
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = -HALF + (tile.x + i / (n - 1)) * size
      const y = HALF - (tile.y + j / (n - 1)) * size
      const c = cellIndex(r, x, y)
      if (c < 0 || Number.isNaN(r.dtm[c]) || measured[c] !== 1) continue
      grid[j * n + i] = r.dtm[c]
      replaced += 1
    }
  }
  return replaced
}

/*
 * CONTOURS AND RELIEF from a height grid, for the 2D Terrain layer (field
 * test, 30 Oct: at the beach the Terrain tile showed nothing at all).
 *
 * relief: the highest minus the lowest height in view. Under FLAT_M the tile
 * says "Flat here" and draws nothing: there is no shape to show.
 *
 * contourSegments: marching squares over an n x n grid, one segment per cell
 * per level, at every multiple of `interval` metres. Grid coordinates out;
 * the caller places them on the map. Saddle cells take the average of the
 * four corners to choose, so the lines do not cross.
 */
export const FLAT_M = 15
export const CONTOUR_M = 10

export function relief(grid: ArrayLike<number>): number | null {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < grid.length; i += 1) {
    const v = grid[i]
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return hi === -Infinity ? null : hi - lo
}

export interface Segment {
  level: number
  /** Grid coordinates: x across (0 at the west), y down (0 at the north). */
  a: [number, number]
  b: [number, number]
}

export function contourSegments(grid: ArrayLike<number>, n: number, interval: number = CONTOUR_M): Segment[] {
  const out: Segment[] = []
  const h = (x: number, y: number) => grid[y * n + x]
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < grid.length; i += 1) {
    lo = Math.min(lo, grid[i])
    hi = Math.max(hi, grid[i])
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return out
  for (let level = Math.ceil(lo / interval) * interval; level <= hi; level += interval) {
    /* A level only touched at its lowest or highest point is a point, not a line. */
    if (level === lo || level === hi) continue
    for (let y = 0; y < n - 1; y += 1) {
      for (let x = 0; x < n - 1; x += 1) {
        const tl = h(x, y)
        const tr = h(x + 1, y)
        const br = h(x + 1, y + 1)
        const bl = h(x, y + 1)
        const code = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0)
        if (code === 0 || code === 15) continue
        const lerp = (p: number, q: number) => (level - p) / (q - p)
        const top: [number, number] = [x + lerp(tl, tr), y]
        const right: [number, number] = [x + 1, y + lerp(tr, br)]
        const bottom: [number, number] = [x + lerp(bl, br), y + 1]
        const left: [number, number] = [x, y + lerp(tl, bl)]
        const seg = (a: [number, number], b: [number, number]) => out.push({ level, a, b })
        const centreHigh = (tl + tr + br + bl) / 4 >= level
        switch (code) {
          case 1: case 14: seg(left, bottom); break
          case 2: case 13: seg(bottom, right); break
          case 3: case 12: seg(left, right); break
          case 4: case 11: seg(top, right); break
          case 6: case 9: seg(top, bottom); break
          case 7: case 8: seg(left, top); break
          case 5: if (centreHigh) { seg(left, top); seg(bottom, right) } else { seg(left, bottom); seg(top, right) } break
          case 10: if (centreHigh) { seg(left, bottom); seg(top, right) } else { seg(left, top); seg(bottom, right) } break
        }
      }
    }
  }
  return out
}

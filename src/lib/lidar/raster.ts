/*
 * FROM POINTS TO THE FOUR THINGS THE APP USES, ON A 1 M GRID OVER THE PATCH.
 *
 *   dtm      the bare ground: the mean of the ground points (ASPRS class 2)
 *            in each cell; cells with none (under a roof, in the water) are
 *            filled from their neighbours, ring by ring.
 *   dsm      the top surface: the highest first return in each cell, noise
 *            (classes 7 and 18) left out; holes filled the same way.
 *   kind     what is on top in each cell: ground, building (6), vegetation
 *            (3, 4, 5), water (9), or nothing measured.
 *   canopy   vegetation height: dsm minus dtm where the top is vegetation.
 *
 * Points come as a flat Float64Array of (x, y, z, class, returnNumber), x and
 * y in Web Mercator. One cell is one ground metre: 1 / metresPerUnit units.
 */
import type { LidarArea } from './grid.ts'

/*
 * 'tall': on top, unclassified (or another class), standing TALL_ABOVE_M over
 * the ground. The USGS projects at both venues classify only ground and
 * water, so roofs and trees alike arrive as class 1; 'tall' is all that can
 * honestly be said of them from the class (applyScan tells roofs from the
 * rest by the footprints).
 */
export const KIND = { none: 0, ground: 1, building: 2, vegetation: 3, water: 4, other: 5, tall: 6 } as const
export const TALL_ABOVE_M = 2
export const STRIDE = 5

export interface Rasters {
  width: number
  height: number
  /** Web Mercator units per cell. */
  cell: number
  minx: number
  maxy: number
  dtm: Float32Array
  dsm: Float32Array
  kind: Uint8Array
  /** 1 where any water return (class 9) fell in the cell, whatever was on top. */
  water?: Uint8Array
  /** 1 where ground returns (class 2) fell in the cell: measured ground, not filled in. */
  ground?: Uint8Array
}

const kindOf = (cls: number): number => (cls === 2 ? KIND.ground : cls === 6 ? KIND.building : cls >= 3 && cls <= 5 ? KIND.vegetation : cls === 9 ? KIND.water : KIND.other)

/** Fills NaN cells from their measured neighbours, outward, until none are left or nothing more can be reached. */
export function fillHoles(grid: Float32Array, width: number, height: number): void {
  for (let pass = 0; pass < width + height; pass += 1) {
    const holes: number[] = []
    for (let i = 0; i < grid.length; i += 1) if (Number.isNaN(grid[i])) holes.push(i)
    if (holes.length === 0) return
    const next: [number, number][] = []
    for (const i of holes) {
      const x = i % width
      const y = (i / width) | 0
      let sum = 0
      let n = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const v = grid[ny * width + nx]
        if (!Number.isNaN(v)) {
          sum += v
          n += 1
        }
      }
      if (n > 0) next.push([i, sum / n])
    }
    if (next.length === 0) return
    for (const [i, v] of next) grid[i] = v
  }
}

export function buildRasters(points: Float64Array, area: LidarArea): Rasters {
  const cell = 1 / area.metresPerUnit
  const width = Math.ceil((area.maxx - area.minx) / cell)
  const height = Math.ceil((area.maxy - area.miny) / cell)
  const n = width * height
  const gSum = new Float64Array(n)
  const gCount = new Uint32Array(n)
  const dsm = new Float32Array(n).fill(Number.NaN)
  const top = new Uint8Array(n)
  /* A cell where a pulse came back more than once: leaves let the laser through, roofs and decks do not. */
  const multi = new Uint8Array(n)
  const water = new Uint8Array(n)
  for (let p = 0; p + STRIDE <= points.length; p += STRIDE) {
    const x = points[p]
    const y = points[p + 1]
    const z = points[p + 2]
    const cls = points[p + 3]
    const ret = points[p + 4]
    if (cls === 7 || cls === 18) continue
    const cx = Math.floor((x - area.minx) / cell)
    const cy = Math.floor((area.maxy - y) / cell)
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
    const i = cy * width + cx
    if (ret >= 2) multi[i] = 1
    if (cls === 9) water[i] = 1
    if (cls === 2) {
      gSum[i] += z
      gCount[i] += 1
    }
    if (ret <= 1 && (Number.isNaN(dsm[i]) || z > dsm[i])) {
      dsm[i] = z
      top[i] = kindOf(cls)
    }
  }
  const dtm = new Float32Array(n)
  for (let i = 0; i < n; i += 1) dtm[i] = gCount[i] > 0 ? gSum[i] / gCount[i] : Number.NaN
  fillHoles(dtm, width, height)
  fillHoles(dsm, width, height)
  /*
   * TALL AND UNCLASSIFIED: vegetation where the pulses came back more than
   * once (a canopy), else just tall (a roof, a deck, the pier, a post). The
   * projects leave both in class 1; the returns tell them apart.
   */
  for (let i = 0; i < n; i += 1) {
    if ((top[i] === KIND.other || top[i] === KIND.ground) && dsm[i] - dtm[i] > TALL_ABOVE_M) top[i] = multi[i] === 1 ? KIND.vegetation : KIND.tall
  }
  const ground = Uint8Array.from(gCount, (c) => (c > 0 ? 1 : 0))
  return { width, height, cell, minx: area.minx, maxy: area.maxy, dtm, dsm, kind: top, water, ground }
}

/** Raster index of a Web Mercator point, or -1 outside. */
export function cellIndex(r: Rasters, x: number, y: number): number {
  const cx = Math.floor((x - r.minx) / r.cell)
  const cy = Math.floor((r.maxy - y) / r.cell)
  return cx < 0 || cy < 0 || cx >= r.width || cy >= r.height ? -1 : cy * r.width + cx
}

/** Vegetation height at a cell (classified, or tall with more than one return), else 0. */
export const canopyAt = (r: Rasters, i: number): number => (i < 0 || r.kind[i] !== KIND.vegetation ? 0 : Math.max(0, r.dsm[i] - r.dtm[i]))

import { describe, expect, it } from 'vitest'
import { buildRasters, KIND } from './raster.ts'
import { lowerSea, overlayDtm, SEA_FLOOR_M } from './terrain.ts'
import { canopyPeaks, footprintMask } from './canopy.ts'
import { mercator, unmercator } from './grid.ts'

/* A 100 m patch in real Web Mercator at the pier: ground at 2.5 m, one 9 m tree, one 12 m building. */
const o = mercator(36.8436, -75.9713)
const k = 1 / Math.cos((36.8436 * Math.PI) / 180)
const area = { minx: o.x, miny: o.y, maxx: o.x + 100 * k, maxy: o.y + 100 * k, id: 't', metresPerUnit: 1 / k }
const pts: number[] = []
for (let a = 0.25; a < 100; a += 0.5) {
  for (let b = 0.25; b < 100; b += 0.5) {
    const x = o.x + a * k
    const y = o.y + b * k
    /* The tree: unclassified like the roof, but the pulse comes back twice (canopy, then ground). */
    if (Math.hypot(a - 20, b - 20) < 2.5) pts.push(x, y, 11.5, 1, 1, x, y, 2.5, 2, 2)
    else if (a > 60 && a < 80 && b > 60 && b < 80) pts.push(x, y, 14.5, 1, 1)
    else pts.push(x, y, 2.5, 2, 1)
  }
}
const r = buildRasters(Float64Array.from(pts), area)
const corner = (a: number, b: number) => unmercator(o.x + a * k, o.y + b * k)
const ring: [number, number][] = [
  [corner(60, 60).lon, corner(60, 60).lat],
  [corner(80, 60).lon, corner(80, 60).lat],
  [corner(80, 80).lon, corner(80, 80).lat],
  [corner(60, 80).lon, corner(60, 80).lat],
]

describe('the scan in the 3D scene', () => {
  it('finds the tree as one peak at 9 m, and not the building (single returns: just tall)', () => {
    expect(r.kind.filter((x) => x === KIND.tall).length).toBeGreaterThan(0)
    expect(r.kind.filter((x) => x === KIND.vegetation).length).toBeGreaterThan(0)
    const peaks = canopyPeaks(r, footprintMask(r, [ring]))
    expect(peaks).toHaveLength(1)
    expect(peaks[0].height).toBeCloseTo(9, 6)
    expect(peaks[0].lat).toBeCloseTo(corner(20, 20).lat, 4)
  })

  it('drops a peak standing in the water (a pier deck reads like a canopy)', () => {
    const wet = new Uint8Array(r.width * r.height).fill(1)
    expect(canopyPeaks({ ...r, water: wet }, footprintMask(r, [ring]))).toHaveLength(0)
  })

  it('puts the lidar ground into a terrain tile inside the patch, and leaves the rest alone', () => {
    const z = 22
    const n = 2 ** z
    const tx = Math.floor(((o.x + 50 * k + Math.PI * 6378137) / (2 * Math.PI * 6378137)) * n)
    const ty = Math.floor(((Math.PI * 6378137 - (o.y + 50 * k)) / (2 * Math.PI * 6378137)) * n)
    const grid = new Float32Array(9).fill(-99)
    const replaced = overlayDtm(grid, 3, { x: tx, y: ty, z }, r)
    expect(replaced).toBe(9)
    expect(grid[4]).toBeCloseTo(2.5, 5)
    const far = new Float32Array(9).fill(-99)
    expect(overlayDtm(far, 3, { x: tx + 1000, y: ty, z }, r)).toBe(0)
    expect(far[4]).toBe(-99)
    /* Where the scan measured no ground (the sea, filled in), the tile's own height stands. */
    const noGround = { ...r, ground: new Uint8Array(r.ground?.length ?? 0) }
    const kept = new Float32Array(9).fill(-99)
    expect(overlayDtm(kept, 3, { x: tx, y: ty, z }, noGround)).toBe(0)
    expect(kept[4]).toBe(-99)
  })
  it('puts the tiles\' 0 m sea below any tide in 3D, and nothing else', () => {
    const g = Float32Array.from([0, 0.0039, -0.5, 2, 0])
    expect(lowerSea(g)).toBe(2)
    expect([...g]).toEqual([SEA_FLOOR_M, Float32Array.from([0.0039])[0], -0.5, 2, SEA_FLOOR_M])
  })
})

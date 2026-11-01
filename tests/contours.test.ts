import { describe, expect, it } from 'vitest'
import { contourSegments, FLAT_M, relief } from '../src/core/contours.ts'

/* The 2D Terrain layer (src/core/contours.ts), field test 30 Oct: nothing showed at the beach. */
describe('relief', () => {
  it('is the highest minus the lowest, and a beach under 15 m is flat', () => {
    const beach = Float32Array.from([0, 2, 4, 6, 3, 1, 0, 5, 9])
    expect(relief(beach)).toBe(9)
    expect(relief(beach)! < FLAT_M).toBe(true)
    expect(relief([])).toBeNull()
  })
})

describe('contours', () => {
  it('a cone 0 to 40 m gives rings at 10, 20 and 30 m, each closed; its top falls between grid points', () => {
    const n = 41
    const grid = new Float32Array(n * n)
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) grid[y * n + x] = Math.max(0, 40 - 2 * Math.hypot(x - 20.3, y - 19.7))
    const segs = contourSegments(grid, n, 10)
    expect([...new Set(segs.map((s) => s.level))]).toEqual([10, 20, 30])
    /* Every ring is closed: each end point is shared by exactly two segments of its level. */
    for (const level of [10, 20, 30]) {
      const ends = new Map<string, number>()
      for (const s of segs.filter((q) => q.level === level)) for (const p of [s.a, s.b]) {
        const k = `${p[0].toFixed(6)},${p[1].toFixed(6)}`
        ends.set(k, (ends.get(k) ?? 0) + 1)
      }
      expect([...ends.values()].every((c) => c === 2)).toBe(true)
    }
    /* The 20 m ring sits 10 cells from the top: radius (40 - 20) / 2. */
    const r20 = segs.filter((s) => s.level === 20).map((s) => Math.hypot(s.a[0] - 20.3, s.a[1] - 19.7))
    expect(Math.min(...r20)).toBeGreaterThan(9.5)
    expect(Math.max(...r20)).toBeLessThan(10.5)
  })

  it('a flat grid has no contours', () => {
    expect(contourSegments(new Float32Array(9).fill(3), 3, 10)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { contourSegments, despike, relief, WATER_M } from '../src/core/contours.ts'

/*
 * THE WAVY LOOPS OFF THE PIER (Batch H, 2 Nov). They were 10 m contours round
 * the oceanfront towers, which the elevation tiles carry as 24 to 62 m spikes
 * beside 0 m sea (measurements/2026-11-02-water-contours.md: 366 segments up
 * to 60 m, relief 69.4 m; after, measurements/2026-11-02-water-contours-after.md:
 * relief 13.9 m, under FLAT_M, so the layer says flat and draws nothing).
 *
 * A made-up beach: land at 3 m on the west, sea at 0 on the east, a row of
 * towers 60 m tall along the waterline, and a broad 40 m hill inland.
 */
const N = 40
function beach(): Float32Array {
  const g = new Float32Array(N * N)
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      let h = x < 28 ? 3 : 0
      if (x === 27 && y % 3 !== 0) h = 60
      const d = Math.hypot(x - 10, y - 20)
      if (d < 7) h += 40 * (1 - d / 7)
      g[y * N + x] = h
    }
  }
  return g
}
const at = (g: Float32Array, x: number, y: number) => g[Math.floor(y) * N + Math.floor(x)]

describe('no land contours over the water', () => {
  it('before: the towers make rings that reach the sea', () => {
    const g = beach()
    const near = contourSegments(g, N, 10).filter((s) => s.a[0] > 26)
    expect(near.length).toBeGreaterThan(0)
    expect(relief(g)).toBe(60 + 0)
  })

  it('after: no line in a cell that touches water, and the towers are gone', () => {
    const land = despike(beach(), N)
    const segs = contourSegments(land, N, 10)
    for (const s of segs) {
      const x = Math.min(s.a[0], s.b[0])
      const y = Math.min(s.a[1], s.b[1])
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(at(land, x + dx, y + dy)).toBeGreaterThan(WATER_M)
    }
    expect(segs.filter((s) => s.a[0] > 24)).toHaveLength(0)
  })

  it('the hill inland keeps its rings', () => {
    const segs = contourSegments(despike(beach(), N), N, 10)
    expect(segs.some((s) => s.level === 20 && Math.abs(s.a[0] - 10) < 6)).toBe(true)
  })
})

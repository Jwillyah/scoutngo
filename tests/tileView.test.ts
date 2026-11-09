import { describe, expect, it } from 'vitest'
import { fitView, inView, viewTiles, worldPx } from '../src/core/tileView.ts'
import { tileAt } from '../src/lib/tileRange.ts'

/* The Buoys page's small map (Batch N, Section 4): a few tiles, every point inside. */
const PIER = { lat: 36.8436, lon: -75.9713 }
const BUOYS = [
  { lat: 36.915, lon: -75.722 },
  { lat: 36.257, lon: -75.593 },
  { lat: 36.2, lon: -75.714 },
]

describe('the static map', () => {
  it('world pixels agree with the tile numbering the offline cache uses', () => {
    for (const z of [5, 9, 12]) {
      const p = worldPx(PIER, z)
      expect({ x: Math.floor(p.x / 256), y: Math.floor(p.y / 256) }).toEqual(tileAt(PIER, z))
    }
  })

  it('fits the pier and its buoys, padded, in 360 x 170 with at most 6 tiles', () => {
    const view = fitView([PIER, ...BUOYS], 360, 170, 28, 5, 12, 6)!
    for (const p of [PIER, ...BUOYS]) {
      const at = inView(view, p)
      expect(at.x).toBeGreaterThanOrEqual(28)
      expect(at.x).toBeLessThanOrEqual(360 - 28)
      expect(at.y).toBeGreaterThanOrEqual(28)
      expect(at.y).toBeLessThanOrEqual(170 - 28)
    }
    const tiles = viewTiles(view)
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThanOrEqual(6)
    /* The tiles cover the box: the first starts at or before its corner, the last ends at or past the other. */
    expect(Math.min(...tiles.map((t) => t.dx))).toBeLessThanOrEqual(0)
    expect(Math.min(...tiles.map((t) => t.dy))).toBeLessThanOrEqual(0)
    expect(Math.max(...tiles.map((t) => t.dx + 256))).toBeGreaterThanOrEqual(360)
    expect(Math.max(...tiles.map((t) => t.dy + 256))).toBeGreaterThanOrEqual(170)
  })

  it('one more zoom would not fit', () => {
    const view = fitView([PIER, ...BUOYS], 360, 170, 28, 5, 12, 6)!
    const closer = fitView([PIER, ...BUOYS], 360, 170, 28, view.z + 1, view.z + 1, 6)!
    const xs = [PIER, ...BUOYS].map((p) => inView(closer, p).x)
    const ys = [PIER, ...BUOYS].map((p) => inView(closer, p).y)
    expect(Math.max(...xs) - Math.min(...xs) > 304 || Math.max(...ys) - Math.min(...ys) > 114).toBe(true)
  })

  it('no points, no map', () => {
    expect(fitView([], 360, 170, 28, 5, 12, 6)).toBeNull()
  })
})

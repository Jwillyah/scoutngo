import { describe, expect, it } from 'vitest'
import { cleanCoastalHeights, cleanTileInContext, CONTEXT_MARGIN_PX, metresPerPixel } from './coastArtefacts.ts'

/*
 * A coast running north-south, sea to the east, at zoom 15 (3.8 m a pixel).
 * Columns 0 to `beach-1` are the land, `beach` is the beach, east of that
 * `shape` decides, and the open sea fills the eastern third.
 */
const W = 240
const PX = 3.8
function coast(shape: (x: number, y: number) => number, land = 4, beach = 100): Float32Array {
  const h = new Float32Array(W * W)
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      h[y * W + x] = x < beach ? land : x === beach ? 1 : x >= 160 ? -3 : shape(x, y)
    }
  }
  return h
}
const at = (h: Float32Array, x: number, y: number) => h[y * W + x]

describe('the elevation cleaned from its own shape, with no coastline', () => {
  it('puts the invented wedge off a beach at sea level, the way it stood off Virginia Beach', () => {
    /* 1 m beach, then in one pixel 12 m, sloping gently down to the sea, with a 40 m blob on it. */
    const h = coast((x, y) => {
      const wedge = 12 * (1 - (x - 101) / 59)
      return x > 120 && x < 128 && y > 100 && y < 110 ? 40 : wedge
    })
    const r = cleanCoastalHeights(h, W, W, PX)
    expect(r.cleared).toBeGreaterThan(0)
    for (const x of [101, 110, 124, 140]) expect(at(h, x, 105)).toBeLessThanOrEqual(2)
    /* The land and the beach as they were. */
    expect(at(h, 50, 105)).toBe(4)
    expect(at(h, 100, 105)).toBe(1)
    /* Below 0 is drawn at 0. */
    expect(at(h, 200, 105)).toBe(0)
  })

  it('leaves a real cliff alone: it drops toward the sea, not away from it', () => {
    const h = coast(() => 0, 50, 100)
    for (let y = 0; y < W; y += 1) for (let x = 100; x < 160; x += 1) h[y * W + x] = 0.5
    const before = Float32Array.from(h)
    const r = cleanCoastalHeights(h, W, W, PX)
    expect(r.cleared).toBe(0)
    expect(at(h, 99, 50)).toBe(before[50 * W + 99])
  })

  it('leaves a dune alone: it slopes, it does not stand vertical', () => {
    /* From the beach the sand rises 1 m a pixel to 20 m and falls back to the sea the same way. */
    const h = coast((x) => Math.max(0.5, 20 - Math.abs(x - 125)), 3, 100)
    const before = Float32Array.from(h)
    cleanCoastalHeights(h, W, W, PX)
    for (const x of [105, 120, 125, 130]) expect(at(h, x, 80)).toBe(before[80 * W + x])
  })

  it('brings an isolated spike on flat ground by the sea down (to its neighbours, or to sea level when it stands like a wall)', () => {
    const h = coast(() => 1)
    h[60 * W + 130] = 15
    cleanCoastalHeights(h, W, W, PX)
    expect(at(h, 130, 60)).toBeLessThanOrEqual(1)
    expect(at(h, 129, 60)).toBe(1)
  })

  it('brings a spike down to the median of its neighbours where it is not a wall', () => {
    /* Ground at 1 m with a 5 m spike: a 4 m step, under the wall's 60 degrees at 3.8 m a pixel. */
    const h = coast(() => 1)
    h[60 * W + 130] = 5
    const r = cleanCoastalHeights(h, W, W, PX)
    expect(r.spikes).toBe(1)
    expect(at(h, 130, 60)).toBe(1)
  })

  it('does nothing inland: with no open sea in the grid there is no shore to clean', () => {
    const h = new Float32Array(W * W).fill(2)
    h[10 * W + 10] = 40
    const r = cleanCoastalHeights(h, W, W, PX)
    expect(r).toEqual({ cleared: 0, spikes: 0, belowSea: 0 })
  })
})

describe('one tile, read with its neighbours', () => {
  it('cleans the middle tile the same as the whole grid would', () => {
    const size = 64
    const margin = CONTEXT_MARGIN_PX
    const whole = (gx: number) => (gx < 90 ? 4 : gx === 90 ? 1 : gx > 150 ? -2 : 10 - (gx - 91) / 6)
    const tiles = Array.from({ length: 9 }, (_, k) => {
      const t = new Float32Array(size * size)
      const ox = (k % 3) * size
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) t[y * size + x] = whole(ox + x)
      return t
    })
    const { heights } = cleanTileInContext(tiles, size, PX, margin)
    /* Column 100 of the whole is column 36 of the middle tile: the wedge, now at sea level. */
    expect(heights[10 * size + 36]).toBe(0)
    /* Column 80 of the whole is land. */
    expect(heights[10 * size + 16]).toBe(4)
  })

  it('reads metres per pixel from latitude and zoom', () => {
    expect(metresPerPixel(36.8435, 15)).toBeCloseTo(3.825, 2)
  })
})

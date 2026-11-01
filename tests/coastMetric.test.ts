import { describe, expect, it } from 'vitest'
import { stairs } from '../scripts/gate/coastMetric.mjs'

/* The coastline staircase count (Batch D, Section 3) tells a raster mask's steps from a drawn line. */
function image(edgeAt: (y: number) => number) {
  const W = 300
  const H = 300
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const wet = x > edgeAt(y)
      data.set(wet ? [255, 0, 255, 255] : [40, 90, 60, 255], (y * W + x) * 4)
    }
  }
  return { width: W, height: H, data }
}

describe('the staircase count', () => {
  it('a drawn diagonal coast has no steps', () => {
    expect(stairs(image((y) => 50 + y * 0.6)).steps).toBe(0)
  })
  it('a curved drawn coast has none either', () => {
    expect(stairs(image((y) => 120 + 60 * Math.sin(y / 70))).steps).toBeLessThanOrEqual(1)
  })
  it('a coarse raster mask of the same coast is a staircase', () => {
    /* The diagonal through 12 px cells, as a mask image upscaled. */
    expect(stairs(image((y) => Math.floor((50 + Math.floor(y / 12) * 12 * 0.6) / 12) * 12)).steps).toBeGreaterThan(10)
  })
})

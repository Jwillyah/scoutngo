import { describe, expect, it } from 'vitest'
import { blocksFor, GLOBAL_FROM_STEP, gridStep, legendTicks, MAX_BLOCKS, particleCount } from '../src/core/windViewport.ts'
import { blockUrl } from '../src/lib/useWindViewport.ts'

/*
 * WIND IS THE WHOLE MAP (Batch TRUTH, Section 7). From the 12 Nov 7:41
 * screenshots: at 500, 1,000 and 2,000 mi the field came in patches, and at
 * 1,000 mi it said "No wind here" over the US.
 */
/* A 390 x 844 phone's view, centred on Virginia Beach, at zoom z: degrees across and up (Mercator near 37°N). */
const view = (z: number) => {
  const lonSpan = (390 / 256) * (360 / 2 ** z)
  const latSpan = Math.min(170, lonSpan * (844 / 390) * Math.cos((37 * Math.PI) / 180))
  return { south: Math.max(-85, 36.8 - latSpan / 2), north: Math.min(85, 36.8 + latSpan / 2), west: -76 - lonSpan / 2, east: -76 + lonSpan / 2 }
}

describe('every zoom is covered whole', () => {
  for (const z of [12, 7, 5, 4, 3, 2]) {
    it(`zoom ${z}: within ${MAX_BLOCKS} requests, and the blocks reach every edge of the view`, () => {
      const b = view(z)
      const step = gridStep(b, z)
      const blocks = blocksFor(b, step)
      expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS)
      const size = 5 * step
      const south = Math.min(...blocks.map((k) => k.south))
      const north = Math.max(...blocks.map((k) => k.south + size - step))
      const west = Math.min(...blocks.map((k) => k.west))
      const east = Math.max(...blocks.map((k) => k.west + size - step))
      expect(south).toBeLessThanOrEqual(Math.max(-85, b.south))
      expect(north).toBeGreaterThanOrEqual(Math.min(85, b.north) - step)
      expect(west).toBeLessThanOrEqual(b.west)
      expect(east).toBeGreaterThanOrEqual(b.east - step)
    })
  }
  it('zoomed out the global blend is asked, never HRRR (it covers the US alone)', () => {
    expect(GLOBAL_FROM_STEP).toBe(1)
    expect(blockUrl([{ lat: 36.8, lon: -76 }], 'blend')).not.toMatch(/models=/)
    expect(blockUrl([{ lat: 36.8, lon: -76 }], 'hrrr')).toMatch(/models=gfs_hrrr/)
  })
})

describe('the look', () => {
  it('fewer streaks zoomed out', () => {
    expect(particleCount(390, 844, 2)).toBeLessThan(particleCount(390, 844, 8) / 2)
  })
  it('the legend line: 0 · 10 · 20 · 30+ knots, in the user\'s unit', () => {
    expect(legendTicks('kt').map((t) => t.label)).toEqual(['0', '10', '20', '30+'])
    expect(legendTicks('mph').map((t) => t.label)).toEqual(['0', '12', '23', '35+'])
    expect(legendTicks('kt')[3].x).toBe(1)
  })
})

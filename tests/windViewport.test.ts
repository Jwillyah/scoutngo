import { describe, expect, it } from 'vitest'
import { BLOCK, blocksFor, buildField, fromUV, gridStep, legendStops, MAX_BLOCKS, MAX_PARTICLES, particleCount, sampleField, toUV, windRgb, type Bounds } from '../src/core/windViewport.ts'

/* Batch Map, Section 1: the wind layer over the whole screen, from fixed blocks, smooth between points. */
const KDH_VIEW: Bounds = { south: 35.8, west: -75.95, north: 36.25, east: -75.4 }

describe('the viewport grid', () => {
  it('covers the screen with fixed blocks of 25 points, never more than MAX_BLOCKS', () => {
    for (const zoom of [5, 7, 9, 11]) {
      const span = 0.5 * 2 ** (9 - zoom)
      const b = { south: 36 - span / 2, west: -75.7 - span / 2, north: 36 + span / 2, east: -75.7 + span / 2 }
      const step = gridStep(b, zoom)
      const blocks = blocksFor(b, step)
      expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS)
      for (const k of blocks) expect(k.points).toHaveLength(BLOCK * BLOCK)
      /* Every corner of the screen is inside some block. */
      for (const [lat, lon] of [[b.south, b.west], [b.north, b.east], [b.south, b.east], [b.north, b.west]]) {
        expect(blocks.some((k) => lat >= k.south && lat <= k.south + (BLOCK - 1) * step + step && lon >= k.west && lon <= k.west + BLOCK * step)).toBe(true)
      }
    }
  })

  it('is the same request for two phones whose screens overlap: blocks depend on where they are, not on the screen', () => {
    const step = 0.25
    const a = blocksFor(KDH_VIEW, step).map((k) => `${k.south},${k.west}`)
    const b = blocksFor({ south: 35.9, west: -75.9, north: 36.2, east: -75.5 }, step).map((k) => `${k.south},${k.west}`)
    expect(b.every((k) => a.includes(k))).toBe(true)
    /* Every point on the step's grid: no one's position in it. */
    for (const k of blocksFor(KDH_VIEW, step)) for (const p of k.points) {
      expect(Math.abs(p.lat / step - Math.round(p.lat / step))).toBeLessThan(1e-6)
      expect(Math.abs(p.lon / step - Math.round(p.lon / step))).toBeLessThan(1e-6)
    }
  })

  it('takes the 0.05° grid (the cache\'s own) from zoom 9 when it fits, 0.25° below', () => {
    expect(gridStep({ south: 36, west: -75.7, north: 36.1, east: -75.6 }, 11)).toBe(0.05)
    expect(gridStep(KDH_VIEW, 8)).toBe(0.25)
  })
})

describe('the field', () => {
  it('turns speed and direction into u, v and back (wind FROM the west moves east)', () => {
    const w = toUV(10, 270)
    expect(w.u).toBeCloseTo(10)
    expect(w.v).toBeCloseTo(0)
    const back = fromUV(w.u, w.v)
    expect(back.speedMps).toBeCloseTo(10)
    expect(back.fromDeg).toBeCloseTo(270)
  })

  it('is smooth between points: bilinear, the middle of four is their mean, a corner is its own value', () => {
    const s = (lat: number, lon: number, u: number) => ({ lat, lon, u, v: 0, gust: u + 2 })
    const f = buildField([s(36, -76, 0), s(36, -75.75, 4), s(36.25, -76, 8), s(36.25, -75.75, 12)], 0.25)
    expect(f).not.toBeNull()
    expect(sampleField(f!, 36.125, -75.875)?.u).toBeCloseTo(6)
    expect(sampleField(f!, 36, -76)?.u).toBeCloseTo(0)
    expect(sampleField(f!, 36, -75.8125)?.u).toBeCloseTo(3)
    expect(sampleField(f!, 36.125, -75.875)?.gust).toBeCloseTo(8)
    expect(sampleField(f!, 37, -76)).toBeNull()
  })
})

describe('the colours, the legend, the particles', () => {
  it('runs blue at calm to red at 30 kt and over, with the board\'s stops', () => {
    expect(windRgb(0)).toEqual([59, 91, 170])
    expect(windRgb(30 / 1.9438444924406)).toEqual([217, 83, 79])
    expect(windRgb(50)).toEqual([217, 83, 79])
    expect(legendStops('kt')).toEqual(['0', '5', '10', '15', '20', '25', '30+'])
    expect(legendStops('mph')[6]).toBe('35+')
  })
  it('scales particles with the screen and the zoom, capped', () => {
    expect(particleCount(390, 844, 12)).toBeGreaterThan(particleCount(390, 844, 5))
    expect(particleCount(4000, 4000, 14)).toBe(MAX_PARTICLES)
  })
})

describe('the days asked for', () => {
  it('three, or enough to reach a plan days ahead, never more than seven', async () => {
    const { gridDays } = await import('../src/lib/useWindViewport.ts')
    const now = Date.parse('2026-11-09T15:00:00Z')
    expect(gridDays(null, now)).toBe(3)
    expect(gridDays(new Date('2026-11-09T20:00:00Z'), now)).toBe(3)
    expect(gridDays(new Date('2026-11-13T12:00:00Z'), now)).toBe(5)
    expect(gridDays(new Date('2026-11-30T12:00:00Z'), now)).toBe(7)
  })
})

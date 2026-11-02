import { describe, expect, it } from 'vitest'
import { cloudGridPoints } from './cloudGrid.ts'
import { flowAt, step, streakColour, toVector, windField } from './windStreaks.ts'

/* The wind map overlay (Batch F, Section 3). Fixtures only. */
describe('wind streaks', () => {
  it('a wind FROM the west carries a streak TO the east, never toward the west', () => {
    const f = toVector(270, 10)
    expect(f.u).toBeCloseTo(10, 9)
    expect(f.v).toBeCloseTo(0, 9)
    const s = step(f, 2)
    expect(s.east).toBeCloseTo(20, 9)
  })

  it('FROM the north goes south, FROM the southwest goes northeast', () => {
    expect(toVector(0, 5).v).toBeCloseTo(-5, 9)
    const sw = toVector(225, Math.SQRT2)
    expect(sw.u).toBeCloseTo(1, 9)
    expect(sw.v).toBeCloseTo(1, 9)
  })

  const venue = { lat: 36.84, lon: -75.97 }
  const grid = (from: number, speed: number | null) =>
    cloudGridPoints(venue).map((p) => ({ at: p.at, cover: 10, wind: [{ heightMeters: 10 as const, speedMps: speed, fromDegrees: from }] }))

  it('reads the grid as a field and blends inside it; nothing outside it', () => {
    const f = windField(grid(270, 6), 10)
    expect(f).not.toBeNull()
    if (f === null) return
    expect(f.lats.length).toBe(5)
    expect(f.lons.length).toBe(5)
    const mid = flowAt(f, venue.lat + 0.1, venue.lon + 0.1)
    expect(mid?.u).toBeCloseTo(6, 6)
    expect(flowAt(f, venue.lat + 5, venue.lon)).toBeNull()
  })

  it('a grid the model did not answer is no field at all, never calm', () => {
    expect(windField(grid(270, null), 10)).toBeNull()
    expect(windField([], 10)).toBeNull()
  })

  it('teal when calm, gold toward the rating, amber only above it', () => {
    expect(streakColour(0, 10)).toBe('rgb(45,212,191)')
    expect(streakColour(10, 10)).toBe('rgb(245,176,33)')
    expect(streakColour(10.5, 10)).toBe('rgb(255,160,74)')
    /* No rating: nothing to be over, so never amber. */
    expect(streakColour(40, null)).toBe('rgb(245,176,33)')
  })
})

import { describe, expect, it } from 'vitest'
import { surfChartMarks } from '../src/core/homeCards.ts'

/* Batch Polish, Section 3: the home's surf chart, readable. Fixture hours, not a forecast. */
const from = new Date('2026-11-11T15:00:00Z') /* 10 AM EST */
const hours = (fts: number[]) => fts.map((ft, i) => ({ at: new Date(from.getTime() + i * 3_600_000), ft, fun: false }))

describe('the surf chart marks', () => {
  it('a 0-4 ft scale at least: gridlines at 1, 2 and 3 ft, as shares from the top', () => {
    const m = surfChartMarks(hours(Array.from({ length: 25 }, (_, i) => 1 + (i % 12) / 6)), from, 24, 'America/New_York')
    expect(m?.grid.map((g) => g.ft)).toEqual([1, 2, 3])
    expect(m?.grid[0].y).toBeCloseTo(1 - 1 / 4.6, 6)
  })
  it('a bigger day grows the scale, and its gridlines with it', () => {
    const m = surfChartMarks(hours(Array.from({ length: 25 }, (_, i) => (i === 12 ? 9 : 4))), from, 24, 'America/New_York')
    expect(m?.grid.map((g) => g.ft)).toEqual([1, 2, 3])
    expect(m?.peak?.ft).toBe(9)
    expect(m?.peak?.x).toBeCloseTo(12 / 24, 6)
  })
  it('the ticks: now, then 6p, 6a and noon in the venue’s zone', () => {
    const m = surfChartMarks(hours(Array.from({ length: 25 }, () => 2).map((x, i) => x + i / 10)), from, 24, 'America/New_York')
    expect(m?.ticks.map((t) => t.label)).toEqual(['now', '6p', '6a'])
    expect(m?.ticks[1].x).toBeCloseTo(8 / 24, 6)
  })
  it('steady all day: no peak, said instead', () => {
    const m = surfChartMarks(hours(Array.from({ length: 25 }, (_, i) => 2 + (i % 2) * 0.2)), from, 24, 'America/New_York')
    expect(m?.steady).toBe(true)
    expect(m?.peak).toBeNull()
  })
})

describe('the tide and drone charts get the same marks (Batch Polish 2, Section 2)', () => {
  it('the tide: "now" 3 h in, gridlines inside its own range, the highest water labelled', async () => {
    const { chartMarks } = await import('../src/core/homeCards.ts')
    const from = new Date('2026-11-11T12:00:00Z')
    const pts = Array.from({ length: 25 }, (_, i) => ({ at: new Date(from.getTime() + i * 3_600_000), v: 1.5 + 1.5 * Math.cos((i / 12.4) * 2 * Math.PI) }))
    const m = chartMarks(pts, from, 24, 'America/New_York', { floor: 0, steady: 0.3, steps: [-1, 0, 1, 2, 3, 4], low: -0.3, high: 3.3, nowAt: 3 / 24 })
    expect(m).not.toBeNull()
    expect(m?.ticks.find((t) => t.label === 'now')?.x).toBeCloseTo(0.125)
    expect(m?.grid.map((g) => g.ft)).toEqual([0, 1, 2])
    expect(m?.peak?.ft).toBeCloseTo(3, 1)
    expect(m?.steady).toBe(false)
  })
  it('the drone: in the wind unit, and "steady" when it moves under 3', async () => {
    const { chartMarks } = await import('../src/core/homeCards.ts')
    const from = new Date('2026-11-11T12:00:00Z')
    const calm = Array.from({ length: 25 }, (_, i) => ({ at: new Date(from.getTime() + i * 3_600_000), v: 8 + (i % 2) }))
    const m = chartMarks(calm, from, 24, 'America/New_York', { floor: 10, steady: 3, steps: [5, 10, 15, 20] })
    expect(m?.steady).toBe(true)
    expect(m?.peak).toBeNull()
    expect(m?.grid.map((g) => g.ft)).toEqual([5, 10])
  })
})

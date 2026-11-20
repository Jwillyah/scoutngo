import { describe, expect, it } from 'vitest'
import { weatherChartModel, type ChartHour } from './weatherChart.ts'

const O = { width: 330, height: 150, padTop: 20, padBottom: 24, padX: 8, barRoom: 30 }
const T0 = Date.UTC(2026, 10, 19, 21)
const hours = (temps: (number | null)[], rain: (number | null)[] = []): ChartHour[] => temps.map((t, i) => ({ at: new Date(T0 + i * 3_600_000), tempC: t, rain: rain[i] ?? null }))

describe('the Weather chart geometry', () => {
  it('one line through 19 hours, now at the left, the warmest highest', () => {
    const m = weatherChartModel(hours(Array.from({ length: 19 }, (_, i) => 10 + (i % 5))), O)
    expect(m.lines).toHaveLength(1)
    expect(m.nowDot?.x).toBe(8)
    expect(m.ticks.map((t) => t.isNow)).toEqual([true, false, false, false])
    expect(m.lo).toBe(10)
    expect(m.hi).toBe(14)
  })
  it('a missing temperature breaks the line; it is never drawn as a zero', () => {
    const m = weatherChartModel(hours([10, 11, null, 12, 13]), O)
    expect(m.lines).toHaveLength(2)
    expect(weatherChartModel(hours([null, null]), O).lines).toEqual([])
    expect(weatherChartModel(hours([null, 3, 4]), O).nowDot).toBeNull()
  })
  it('rain bars only from 10%, taller for more, none for an unknown chance', () => {
    const m = weatherChartModel(hours([10, 10, 10, 10], [0.05, 0.1, 0.6, null]), O)
    expect(m.bars.map((b) => b.chance)).toEqual([0.1, 0.6])
    expect(m.bars[1].h).toBeGreaterThan(m.bars[0].h)
  })
  it('a flat day still draws a line, mid-height', () => {
    const m = weatherChartModel(hours([12, 12, 12]), O)
    expect(m.lines).toHaveLength(1)
    expect(m.nowDot?.y).toBeCloseTo((20 + (150 - 24 - 30)) / 2, 5)
  })
})

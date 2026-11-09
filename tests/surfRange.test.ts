import { describe, expect, it } from 'vitest'
import { correctedRange, type SpotStats } from '../src/core/spotSkill.ts'
import { BUOY_MATCH_FT, buoyVsForecast, camDistance, chartTopFt, CHART_MIN_TOP_FT, cleanRuns, peakHour, rangeEnds, rangeWords, seaSpreadFt } from '../src/core/surfRange.ts'

const NONE: SpotStats = { n: 0, biasFt: null, spreadFt: null, days: 0 }
const H = 3_600_000

describe('the surf range (Batch N, Section 1)', () => {
  it('is always two different numbers, never one', () => {
    for (let lo = 0; lo <= 8; lo += 0.05) {
      for (const w of [0, 0.2, 0.5, 1, 2.3]) {
        const [a, b] = rangeEnds(lo, lo + w)
        expect(b).toBeGreaterThan(a)
        expect(a).toBeGreaterThanOrEqual(0)
      }
    }
    expect(rangeWords({ lowFt: 0.6, highFt: 2.4 })).toBe('1–2 ft')
    expect(rangeWords({ lowFt: 0, highFt: 0.3 })).toBe('0–1 ft')
    expect(rangeWords({ lowFt: 1.2, highFt: 1.3 }, '')).toBe('1–2')
  })

  it('every band from correctedRange words as a range', () => {
    for (let f = 0; f < 10; f += 0.1) {
      const r = correctedRange(f, seaSpreadFt(f, f * 1.2), NONE)
      expect(rangeWords(r)).toMatch(/^\d+–\d+ ft$/)
    }
  })

  it('the spread is the two faces apart, and nothing with one', () => {
    expect(seaSpreadFt(2, 3.2)).toBeCloseTo(1.2)
    expect(seaSpreadFt(3.2, 2)).toBeCloseTo(1.2)
    expect(seaSpreadFt(2, null)).toBeNull()
    expect(seaSpreadFt(null, 2)).toBeNull()
    expect(seaSpreadFt(Number.NaN, 2)).toBeNull()
  })

  it('the buoy is in line within the tolerance, bigger or smaller outside it', () => {
    expect(buoyVsForecast(2, 2 + BUOY_MATCH_FT)).toBe('in line with')
    expect(buoyVsForecast(2, 2 - BUOY_MATCH_FT)).toBe('in line with')
    expect(buoyVsForecast(2.6, 2)).toBe('bigger than')
    expect(buoyVsForecast(1.4, 2)).toBe('smaller than')
  })

  it('joins clean hours into stretches and breaks them at a messy hour', () => {
    const hours = [0, 1, 2, 3, 4, 5].map((i) => ({
      at: i * H,
      clean: i !== 2 && i !== 5,
    }))
    expect(cleanRuns(hours)).toEqual([
      { from: 0, to: 2 * H },
      { from: 3 * H, to: 5 * H },
    ])
    expect(cleanRuns([])).toEqual([])
  })

  it('picks the biggest hour, the first of a tie', () => {
    const a = { centerFt: 2, id: 'a' }
    const b = { centerFt: 3, id: 'b' }
    const c = { centerFt: 3, id: 'c' }
    expect(peakHour([a, b, c])?.id).toBe('b')
    expect(peakHour([])).toBeNull()
  })

  it('the chart top covers the highest value and is never under the floor', () => {
    expect(chartTopFt([0.4, 1.1])).toBe(CHART_MIN_TOP_FT)
    expect(chartTopFt([2.2, 5.1])).toBe(6)
    expect(chartTopFt([])).toBe(CHART_MIN_TOP_FT)
  })
  it('the cam distance, miles or km, a decimal under 10', () => {
    expect(camDistance(0.4, true)).toBe('0.2 mi')
    expect(camDistance(0.4, false)).toBe('0.4 km')
    expect(camDistance(20, true)).toBe('12 mi')
  })
})

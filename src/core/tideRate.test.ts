import { describe, expect, it } from 'vitest'
import { rateFromCurve, rateFromTurns, RATE_AGREE_FT_PER_H, tideRate } from './tideRate.ts'
import type { TideExtreme, TideSample } from './tide.ts'

const T0 = Date.parse('2026-10-27T06:00:00Z')
const H = 3_600_000
/* A low of 0.2 ft and a high of 3.8 ft six hours later, joined by the half cosine: the two methods must agree exactly here. */
const extremes: TideExtreme[] = [
  { at: new Date(T0), feet: 0.2, kind: 'low' },
  { at: new Date(T0 + 6 * H), feet: 3.8, kind: 'high' },
]
const curve: TideSample[] = Array.from({ length: 61 }, (_, i) => {
  const s = i / 60
  return { at: new Date(T0 + s * 6 * H), feet: 0.2 + 3.6 * ((1 - Math.cos(Math.PI * s)) / 2) }
})

describe('how fast the tide moves, two ways', () => {
  it('agree on a half cosine, to well inside the tolerance', () => {
    for (const hours of [0.5, 1.5, 3, 4.5, 5.5]) {
      const at = new Date(T0 + hours * H)
      const a = rateFromCurve(curve, at)
      const b = rateFromTurns(extremes, at)
      expect(a).not.toBeNull()
      expect(Math.abs((a ?? 0) - (b ?? 0))).toBeLessThan(0.02)
      expect(Math.abs((a ?? 0) - (b ?? 0))).toBeLessThan(RATE_AGREE_FT_PER_H)
    }
  })

  it('peaks mid-tide at the hand-worked value: 3.6 ft x pi / (2 x 6 h) = 0.942 ft/h', () => {
    expect(rateFromTurns(extremes, new Date(T0 + 3 * H))).toBeCloseTo((3.6 * Math.PI) / 12, 6)
  })

  it('is near zero at a turn, rising before a high, falling after it', () => {
    expect(Math.abs(rateFromTurns(extremes, new Date(T0 + 1)) ?? 1)).toBeLessThan(0.001)
    const falling: TideExtreme[] = [extremes[1], { at: new Date(T0 + 12 * H), feet: 0.4, kind: 'low' }]
    expect(rateFromTurns(falling, new Date(T0 + 9 * H)) ?? 0).toBeLessThan(0)
    expect(tideRate([], extremes, new Date(T0 + 3 * H), true)).toBeCloseTo(0.942, 2)
  })
})

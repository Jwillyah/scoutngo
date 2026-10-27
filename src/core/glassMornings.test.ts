import { describe, expect, it } from 'vitest'
import { glassMornings } from './glassMornings.ts'

const sunrise = (d: number) => new Date(Date.UTC(2026, 9, 27 + d, 11, 22))
const days = [0, 1, 2, 3].map((d) => ({ date: `2026-10-${27 + d}`, sunrise: sunrise(d) }))
const lows = [new Date(sunrise(0).getTime() + 40 * 60_000), new Date(sunrise(1).getTime() - 80 * 60_000), new Date(sunrise(2).getTime() + 30 * 60_000), new Date(sunrise(3).getTime() + 200 * 60_000)]

describe('glass mornings', () => {
  it('marks low near sunrise with glassy wind, windy wind, beyond the forecast, and a low too far from sunrise', () => {
    const wind = (at: Date) => {
      if (at.getTime() === sunrise(0).getTime()) return { speedMps: 1, fromDeg: 90 }
      if (at.getTime() === sunrise(1).getTime()) return { speedMps: 8, fromDeg: 90 }
      return null
    }
    const got = glassMornings(days, lows, wind, 90)
    expect(got.map((m) => m.mark)).toEqual(['glass', 'windy', 'tide-only', 'none'])
    expect(got[0].minutesFromSunrise).toBe(40)
    expect(got[1].minutesFromSunrise).toBe(-80)
  })

  it('an offshore breeze still counts as glassy', () => {
    const got = glassMornings(days.slice(0, 1), lows, () => ({ speedMps: 7, fromDeg: 270 }), 90)
    expect(got[0].mark).toBe('glass')
  })
})

describe('surf + glass mornings', () => {
  it('a glass morning with surf at sunrise is marked surf + glass; without surf, glass', () => {
    const calm = () => ({ speedMps: 1, fromDeg: 90 })
    expect(glassMornings(days.slice(0, 1), lows, calm, 90, () => 2.5)[0].mark).toBe('surf-glass')
    expect(glassMornings(days.slice(0, 1), lows, calm, 90, () => 0.4)[0].mark).toBe('glass')
    expect(glassMornings(days.slice(0, 1), lows, calm, 90, () => null)[0].mark).toBe('glass')
  })
})

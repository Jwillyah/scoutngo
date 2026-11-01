import { describe, expect, it } from 'vitest'
import { buoyWords, cleanestRun, namedTrains, type WindHour } from '../src/core/surfWords.ts'
import { formatShortHour } from '../src/core/timezone.ts'

/* The Surf page's words, from the field test of 30 Oct (src/core/surfWords.ts). */
describe('swell trains', () => {
  it('a 6–7 s swell is Primary, not groundswell; groundswell from 10 s; three at most, biggest first', () => {
    const t = namedTrains([
      { heightM: 0.9, periodS: 6.5, fromDeg: 80 },
      { heightM: 0.4, periodS: 12, fromDeg: 120 },
      null,
      { heightM: 0.2, periodS: 4, fromDeg: 30 },
      { heightM: 0.1, periodS: 9, fromDeg: 30 },
    ])
    expect(t.map((x) => `${x.rank} ${x.periodS}s ${x.groundswell ? 'groundswell' : ''}`.trim())).toEqual(['Primary 6.5s', 'Secondary 12s groundswell', 'Third 4s'])
  })
})

describe('the cleanest stretch', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 30, h))
  it('follows the wind to the beach first: never onshore, however light', () => {
    /* 30 Oct: the evening was onshore; it was called cleanest. */
    const hours: WindHour[] = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((h) => ({ at: at(h), cls: h < 8 ? 'offshore' : h < 11 ? 'cross' : 'onshore' }))
    expect(cleanestRun(hours)).toEqual({ from: at(5), to: at(8), cls: 'offshore' })
  })
  it('cross-shore when there is no offshore hour, and nothing when every hour is onshore', () => {
    expect(cleanestRun([{ at: at(9), cls: 'cross' }, { at: at(10), cls: 'onshore' }])?.cls).toBe('cross')
    expect(cleanestRun([{ at: at(9), cls: 'onshore' }, { at: at(10), cls: null }])).toBeNull()
  })
})

describe('the buoy against the forecast, in words', () => {
  it('says which way and gives both numbers', () => {
    expect(buoyWords(3.6, 2.9)).toBe('The buoy is running bigger than forecast: 3.6 vs 2.9 ft')
    expect(buoyWords(2.0, 2.9)).toBe('The buoy is running smaller than forecast: 2.0 vs 2.9 ft')
    expect(buoyWords(3.0, 2.9)).toBe('The buoy is about as forecast: 3.0 vs 2.9 ft')
    expect(buoyWords(null, 2.9)).toBeNull()
  })
})

describe('hour labels', () => {
  it('"10a", never "10 AM" on a strip a few pixels wide', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 30, h))
    expect([5, 10, 12, 14, 0].map((h) => formatShortHour(at(h), 'UTC', 12))).toEqual(['5a', '10a', '12p', '2p', '12a'])
    expect(formatShortHour(at(14), 'UTC', 24)).toBe('14')
  })
})

import { describe, expect, it } from 'vitest'
import type { TideExtreme } from '../src/core/tide.ts'
import { NEAP_UNDER, SPRING_OVER, springOrNeap, TYPICAL_MIN_DAYS, typicalRangeFeet } from '../src/core/tideWindow.ts'

/*
 * SPRING OR NEAP (Batch Beach, Section 2): from the moon AND the station's
 * own typical day. A fixture month, not a station: a 3.4 ft typical ocean
 * day swinging ±0.6 ft over half a lunar month, and a 0.4 ft sound.
 */
const TZ = 'America/New_York'
const month = (mean: number, swing: number): TideExtreme[] =>
  Array.from({ length: 30 }, (_, d) => {
    const r = mean + swing * Math.cos((2 * Math.PI * d) / 14.77)
    const noon = Date.UTC(2026, 10, 1 + d, 17)
    return [
      { at: new Date(noon - 3 * 3_600_000), kind: 'low' as const, feet: 0 },
      { at: new Date(noon + 3 * 3_600_000), kind: 'high' as const, feet: r },
    ]
  }).flat() as TideExtreme[]

describe('spring tides: the moon and the station agree', () => {
  it('the typical day is the median day of the month in hand; too few days, none', () => {
    expect(typicalRangeFeet(month(3.4, 0.6), TZ)).toBeCloseTo(3.4, 0)
    expect(typicalRangeFeet(month(3.4, 0.6).slice(0, 2 * (TYPICAL_MIN_DAYS - 1)), TZ)).toBeNull()
  })

  it('spring only when the moon says so and today runs big for this station', () => {
    const typ = typicalRangeFeet(month(3.4, 0.6), TZ) as number
    expect(springOrNeap('spring', SPRING_OVER * typ + 0.01, typ)).toBe('spring')
    expect(springOrNeap('spring', typ, typ)).toBeNull()
    expect(springOrNeap(null, 4.5, typ)).toBeNull()
    expect(springOrNeap('neap', NEAP_UNDER * typ - 0.01, typ)).toBe('neap')
    expect(springOrNeap('neap', typ, typ)).toBeNull()
  })

  it('without the station’s month, nothing is said', () => {
    expect(springOrNeap('spring', 4.5, null)).toBeNull()
    expect(springOrNeap('spring', null, 3.4)).toBeNull()
  })

  it('a sound station measures against its own day, not the ocean’s', () => {
    const typ = typicalRangeFeet(month(0.4, 0.08), TZ) as number
    expect(springOrNeap('spring', 0.47, typ)).toBe('spring')
    expect(springOrNeap('spring', 0.4, typ)).toBeNull()
  })
})

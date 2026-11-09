import { describe, expect, it } from 'vitest'
import { bodyPart, buoyParts, forecastParts, periodRead, rangeSizeWords } from '../src/core/surfReads.ts'
import { rangeEnds, rangeWords } from '../src/core/surfRange.ts'

/* Batch MAP2, Section 1: field check 9 Nov 12:46 PM, Virginia Beach. */
describe('size words come from the headline\'s own ends', () => {
  it('"2–4 ft" is knee to chest, never knee to waist', () => {
    expect(rangeWords({ lowFt: 2, highFt: 4 })).toBe('2–4 ft')
    expect(rangeSizeWords(2, 4)).toBe('knee to chest')
  })
  it('every half foot from 0 to 10, the words name the two printed ends', () => {
    for (let c = 0; c <= 10; c += 0.5) {
      for (const half of [0.4, 1, 1.6]) {
        const [lo, hi] = rangeEnds(c - half, c + half)
        const words = rangeSizeWords(c - half, c + half)
        const a = bodyPart(lo)
        const b = bodyPart(hi)
        expect(words, `${c}±${half} → ${lo}–${hi}`).toBe(a === b ? (a === 'flat' ? 'flat' : `${a} high`) : `${a} to ${b}`)
      }
    }
  })
})

describe('the period is the dominant one', () => {
  it('44099 read 13 s dominant while the forecast\'s mean was 9 s: the buoy\'s 13 s is shown', () => {
    expect(periodRead(13, true, null, 9.3, '44099')).toEqual({ s: 13, words: '13 s at 44099', from: 'buoy' })
  })
  it('no fresh buoy: the forecast\'s peak, else its mean said as a mean', () => {
    expect(periodRead(13, false, 11.6, 9.3)?.words).toBe('12 s peak')
    expect(periodRead(null, false, null, 9.3)?.words).toBe('9 s mean')
    expect(periodRead(null, false, null, null)).toBeNull()
  })
})

describe('swell parts', () => {
  it('the forecast\'s parts, biggest first, only those it gives', () => {
    const v: Record<string, number> = { swell_wave_height: 0.64, swell_wave_period: 9.3, swell_wave_direction: 100, secondary_swell_wave_height: 0.22, secondary_swell_wave_period: 8, secondary_swell_wave_direction: 39, wind_wave_height: 0.3, wind_wave_period: 4, wind_wave_direction: 20 }
    const parts = forecastParts((n) => v[n] ?? null)
    expect(parts.map((p) => p.name)).toEqual(['Swell', 'Wind waves', 'Second swell'])
    expect(parts[0].ft).toBeCloseTo(2.1, 1)
  })
  it('a buoy\'s parts are what its .spec has, never a third', () => {
    const p = buoyParts({ swellM: 0.6, swellS: 11.8, swellFrom: 'ESE', windWaveM: 0.8, windWaveS: 9.9, windWaveFrom: 'E' })
    expect(p.map((x) => x.name)).toEqual(['Swell', 'Wind waves'])
    expect(p[0].fromDeg).toBe(112.5)
    expect(buoyParts({ swellM: null, swellS: null, swellFrom: null, windWaveM: 0.8, windWaveS: 9.9, windWaveFrom: 'E' })).toHaveLength(1)
    expect(buoyParts(null)).toEqual([])
  })
})

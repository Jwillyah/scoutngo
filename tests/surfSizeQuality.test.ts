import { describe, expect, it } from 'vitest'
import { CALM_GLASSY_WORDS, surfCall, surfQuality } from '../src/core/surfCall.ts'

/*
 * SIZE AND QUALITY, SEPARATE (Batch SIMPLE-3, Section 5.1 and 5.2). 23 Nov:
 * 2-3 ft clean, 10 s, light offshore. The pill said "Small"; Surfline said
 * "Fair" and Jwilly: "def a go all day". Under 5 kt the water is glassy and
 * the side of the beach means nothing (NE cross-onshore here, SW offshore at
 * Surfline, both at 2-3 kt).
 */
describe('23 Nov: 2-3 ft, clean, 10 s, light offshore', () => {
  const h = { centerFt: 2.5, shape: 'Clean' as const, side: 'offshore', chop: false, periodS: 10, windKt: 7 }
  it('the number is the size and the pill is Fair, never Small', () => {
    const c = surfCall(h, 0)!
    expect(c.words).toBe('2–3 ft')
    expect(c.quality).toBe('Fair')
    expect(c.quality).not.toBe('Small')
    expect(c.wind).toBe('clean, offshore')
  })
  it('with the wind at 2 kt: "Calm · glassy" and no onshore or offshore word', () => {
    const c = surfCall({ ...h, windKt: 2, side: 'cross-onshore' }, 0)!
    expect(c.wind).toBe(CALM_GLASSY_WORDS)
    expect(c.wind).not.toMatch(/shore/)
    expect(c.quality).toBe('Fair')
  })
  it('wind not known: no "calm"', () => {
    expect(surfCall({ ...h, windKt: null }, 0)!.wind).toBe('clean, offshore')
  })
})

describe('the scale', () => {
  it('runs Poor, Poor-Fair, Fair, Good with size on clean water', () => {
    expect([0.4, 1.5, 2.5, 5].map((ft) => surfQuality(ft, false, 'Clean'))).toEqual(['Poor', 'Poor-Fair', 'Fair', 'Good'])
  })
  it('the wind on the water drops it, never below Poor', () => {
    expect(surfQuality(5, false, 'Bumpy')).toBe('Fair')
    expect(surfQuality(2.5, false, 'Messy')).toBe('Poor')
    expect(surfQuality(0.5, false, 'Messy')).toBe('Poor')
    expect(surfQuality(2.5, false, null)).toBe('Poor-Fair')
  })
  it('a short period drops a step; not known changes nothing', () => {
    expect(surfQuality(2.5, false, 'Clean', 5)).toBe('Poor-Fair')
    expect(surfQuality(2.5, false, 'Clean', null)).toBe('Fair')
  })
  it('chop keeps its own words', () => {
    expect(surfQuality(1.3, true, 'Bumpy')).toBe('Poor · choppy')
    expect(surfQuality(3, true, 'Bumpy')).toBe('Fair · textured')
  })
})

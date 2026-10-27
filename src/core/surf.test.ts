import { describe, expect, it } from 'vitest'
import { angledHeight, BREAK_AGREE, breakKomar, breakLeMehaute, surfEstimate, surfShape, surfSize } from './surf.ts'

describe('breaking height, two published formulas', () => {
  it('Komar and Gaillard by hand: H0 1 m, T 10 s gives 0.39 x 9.81^0.2 x 10^0.4 = 1.547 m', () => {
    /* 9.81^0.2 = 1.5793 and (T H0^2)^0.4 = 10^0.4 = 2.5119: 0.39 x 1.5793 x 2.5119 = 1.547. */
    expect(breakKomar(1, 10)).toBeCloseTo(0.39 * 9.81 ** 0.2 * 10 ** 0.4, 6)
    expect(breakKomar(1, 10)).toBeCloseTo(1.547, 2)
  })

  it('Le Mehaute and Koh by hand: H0 1 m, T 10 s, slope 1/50', () => {
    const l0 = (9.81 * 100) / (2 * Math.PI)
    expect(breakLeMehaute(1, 10, 1 / 50)).toBeCloseTo(0.76 * (1 / 50) ** (1 / 7) * (1 / l0) ** -0.25, 6)
  })

  it('agree within the stated tolerance across ordinary swells', () => {
    for (const h of [0.3, 0.6, 1, 1.5, 2.5]) {
      for (const t of [6, 8, 10, 12, 14]) {
        const a = breakKomar(h, t)
        const b = breakLeMehaute(h, t)
        expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(BREAK_AGREE)
      }
    }
  })
})

describe('swell at an angle, and the words', () => {
  it('square-on keeps its height, 60 degrees off keeps sqrt(0.5) of it, going away keeps none', () => {
    expect(angledHeight(1, 78, 78)).toBeCloseTo(1, 6)
    expect(angledHeight(1, 138, 78)).toBeCloseTo(Math.SQRT1_2, 6)
    expect(angledHeight(1, 258, 78)).toBe(0)
  })

  it('says the size and the shape in words', () => {
    expect(surfSize(0.5)).toBe('Flat')
    expect(surfSize(3)).toBe('Fun')
    expect(surfSize(7)).toBe('Big')
    expect(surfShape(1, 90, 78)).toBe('Clean')
    expect(surfShape(7, 270, 78)).toBe('Clean')
    expect(surfShape(7, 90, 78)).toBe('Messy')
    expect(surfShape(7, 0, 78)).toBe('Bumpy')
    expect(surfEstimate(0.6, 11.8, 90, 78).size).toBe('Fun')
  })
})

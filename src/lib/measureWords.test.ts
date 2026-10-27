import { describe, expect, it } from 'vitest'
import { measureWords } from './measureWords.ts'

describe('the two-pin measure, in words', () => {
  it('asks for each pin in turn', () => {
    expect(measureWords([], 'm')).toBe('Tap the first point, or long-press.')
    expect(measureWords([{ lat: 36.8, lon: -76 }], 'm')).toBe('Tap the second point.')
  })

  it('says the distance and the heading from the code, short: "1,456 ft · NNW 347°"', () => {
    /* Due east along a parallel, about 1 km at 36.8 N. */
    const out = measureWords([{ lat: 36.8, lon: -76 }, { lat: 36.8, lon: -75.988779 }], 'm')
    expect(out).toMatch(/^(99\d|1,?00\d) m · E 90°$/)
    /* North-northwest, in feet, fits one line on a phone. */
    const nnw = measureWords([{ lat: 36.8, lon: -76 }, { lat: 36.80389, lon: -76.00106 }], 'ft')
    expect(nnw).toMatch(/^1,\d{3} ft · NNW 34\d°$/)
    expect(nnw.length).toBeLessThanOrEqual(22)
  })
})

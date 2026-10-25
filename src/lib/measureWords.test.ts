import { describe, expect, it } from 'vitest'
import { measureWords } from './measureWords.ts'

describe('the two-pin measure, in words', () => {
  it('asks for each pin in turn', () => {
    expect(measureWords([], 'm')).toBe('Tap the first point.')
    expect(measureWords([{ lat: 36.8, lon: -76 }], 'm')).toBe('Tap the second point.')
  })

  it('says the distance and both headings from the code', () => {
    /* Due east along a parallel, about 1 km at 36.8 N. */
    const out = measureWords([{ lat: 36.8, lon: -76 }, { lat: 36.8, lon: -75.988779 }], 'm')
    expect(out).toMatch(/^(99\d|1,?00\d) m, heading 90° east\. Back: 270° west\.$/)
  })
})

import { describe, expect, it } from 'vitest'
import { titleName, upperWords } from '../src/core/faaWords.ts'

/* Batch TRUTH, Section 6: the FAA's raw values in words. */
describe('upper limits', () => {
  it('-9998 is "up to the airspace above", never "to -9998"', () => {
    expect(upperWords(-9998, '')).toBe('up to the airspace above')
    expect(upperWords(-9999, '')).toBeNull()
    expect(upperWords(2500, 'FT')).toBe('to 2,500 ft')
    expect(upperWords(180, 'FL')).toBe('to flight level 180')
    expect(upperWords(null, 'FT')).toBeNull()
  })
})

describe('names in title case', () => {
  it('"OCEANA NAS CLASS D" reads "Oceana NAS Class D"', () => {
    expect(titleName('OCEANA NAS CLASS D')).toBe('Oceana NAS Class D')
    expect(titleName('NORFOLK INTL CLASS C')).toBe('Norfolk Intl Class C')
    expect(titleName('R-2202D')).toBe('R-2202D')
    expect(titleName('ABILENE, DYESS AFB CLASS E3')).toBe('Abilene, Dyess AFB Class E3')
    expect(titleName('BACK BAY NWR')).toBe('Back Bay NWR')
  })
})

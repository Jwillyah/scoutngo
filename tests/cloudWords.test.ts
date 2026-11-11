import { describe, expect, it } from 'vitest'
import { cloudWord, stationCloudWord } from '../src/core/cloudWords.ts'

describe('the cloud pill in plain words (Batch Map, Section 0)', () => {
  it('says the most cover of the three layers as a word', () => {
    expect(cloudWord({ low: 0, mid: 0, high: 0 })).toBe('Clear')
    expect(cloudWord({ low: 40, mid: 20, high: 0 })).toBe('Some')
    expect(cloudWord({ low: 5, mid: 0, high: 95 })).toBe('Overcast')
    expect(cloudWord({ low: null, mid: null, high: null })).toBeNull()
  })
  it("says a station's sky the same way", () => {
    expect(stationCloudWord({ station: 'KNTU', clear: true, groups: [] })).toBe('Clear')
    expect(stationCloudWord({ station: 'KNTU', clear: false, groups: [{ amount: 'FEW', baseFt: 2000 }, { amount: 'BKN', baseFt: 8000 }] } as never)).toBe('Mostly')
  })
})

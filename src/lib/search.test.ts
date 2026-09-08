import { describe, expect, it } from 'vitest'
import { MIN_INTERVAL_MS, parseSearchRows, searchUrl } from './search.ts'

describe('searchUrl', () => {
  it('hits Nominatim with a JSON format and an encoded query', () => {
    const url = searchUrl('Brew River Dock Bar, Salisbury MD')
    expect(url).toContain('https://nominatim.openstreetmap.org/search')
    expect(url).toContain('format=json')
    expect(url).toContain('Brew+River+Dock+Bar%2C+Salisbury+MD')
  })
})

describe('rate limit', () => {
  it('is at least one second, which is their published policy', () => {
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000)
  })
})

describe('parseSearchRows', () => {
  const row = { place_id: 1, display_name: 'Brew River, Salisbury', lat: '38.36', lon: '-75.60' }

  it('reads the rows Nominatim returns', () => {
    expect(parseSearchRows([row])).toEqual([
      { id: '1', label: 'Brew River, Salisbury', lat: 38.36, lon: -75.6 },
    ])
  })

  it('drops rows with unusable coordinates', () => {
    expect(parseSearchRows([{ ...row, lat: 'nope' }])).toEqual([])
    expect(parseSearchRows([{ ...row, display_name: 42 }])).toEqual([])
  })

  it('caps the list and survives junk', () => {
    expect(parseSearchRows(Array.from({ length: 20 }, () => row))).toHaveLength(6)
    expect(parseSearchRows(null)).toEqual([])
    expect(parseSearchRows({ error: 'nope' })).toEqual([])
  })
})

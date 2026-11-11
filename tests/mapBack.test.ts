import { describe, expect, it } from 'vitest'
import { mapBack } from '../src/lib/mapBack.ts'

/* Batch Beach, Section 5: Wind Data → Map → Back → Wind Data; the map opened from the home goes back home. */
describe('the map’s Back', () => {
  it('returns to the page it was opened from', () => {
    expect(mapBack('wind')).toEqual({ kind: 'page', page: 'wind' })
    expect(mapBack('surf')).toEqual({ kind: 'page', page: 'surf' })
  })
  it('opened from the home, it goes home', () => {
    expect(mapBack(null)).toEqual({ kind: 'home' })
  })
})

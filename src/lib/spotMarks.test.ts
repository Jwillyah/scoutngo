import { describe, expect, it } from 'vitest'
import { reviveSpot } from './spots.ts'
import { EMPTY_VENUE } from './venue.ts'

/*
 * A SAVED SPOT KEEPS ITS MARKS THROUGH A RELOAD. Stored spots are revived on
 * every launch, and the reviver used to rebuild the spot field by field and
 * leave `marks` out, so the wires drawn at a place were gone the next time
 * the app opened.
 */
describe('a saved spot keeps its marks', () => {
  it('survives the round trip through storage', () => {
    const mark = { id: 'm1', kind: 'hazard', label: 'wire', geometry: { kind: 'point', at: { lat: 1, lon: 2 } } }
    const stored = JSON.parse(
      JSON.stringify({ id: 's', name: 'Dock', savedAt: '2026-10-25T00:00:00Z', venue: EMPTY_VENUE, kit: {}, positions: [], marks: [mark] }),
    )
    expect(reviveSpot(stored)?.marks).toEqual([mark])
  })

  it('a spot saved before marks existed has none, not a broken list', () => {
    expect(reviveSpot({ id: 's', name: 'Dock', venue: EMPTY_VENUE, kit: {}, positions: [] })?.marks).toBeUndefined()
  })
})

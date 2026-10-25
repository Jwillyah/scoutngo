import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { defaultSelection } from './kitSelection.ts'
import { mergeSpots, newSpotId, reviveSpot, reviveSpots, type Spot } from './spots.ts'
import { CALIBRATION_VENUE, EMPTY_VENUE } from './venue.ts'

const spot = (over: Partial<Spot> = {}): Spot => ({
  id: 'spot-1',
  name: 'Brew River',
  savedAt: '2026-09-12T12:00:00.000Z',
  venue: CALIBRATION_VENUE,
  kit: defaultSelection(DEFAULT_KIT),
  positions: [],
  ...over,
})

/*
 * The file round trip moved to src/lib/scoutFile.test.ts with the format: one
 * file format, one reader, one set of tests for it.
 */
describe('reviving spots, which a file may have hand edited', () => {
  it('fills a missing savedAt rather than dropping the spot', () => {
    const { savedAt: _drop, ...rest } = spot()
    const revived = reviveSpots([rest])
    expect(revived).toHaveLength(1)
    expect(revived[0].savedAt).toBeTruthy()
  })
})

describe('mergeSpots', () => {
  it('replaces a spot with the same id rather than duplicating it', () => {
    const merged = mergeSpots([spot()], [spot({ name: 'Renamed' })])
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('Renamed')
  })

  it('keeps both when the ids differ, newest first', () => {
    const merged = mergeSpots(
      [spot()],
      [spot({ id: 'spot-2', name: 'Later', savedAt: '2026-10-01T00:00:00.000Z' })],
    )
    expect(merged.map((s) => s.name)).toEqual(['Later', 'Brew River'])
  })
})

/*
 * CANONICAL PLACE IDS.
 *
 * "Rodanthe" and "Rodanthe North Carolina" are the same place reached two ways,
 * and providers return them on slightly different coordinates, so a saved list
 * grows two entries for one place. The provider id is the provider saying they
 * are one place, which is a stronger claim than two coordinates being close.
 */
describe('the same place, searched two ways', () => {
  const place = (over: Partial<Spot>): Spot => ({
    id: newSpotId(),
    name: 'Rodanthe',
    savedAt: '2026-10-01T10:00:00.000Z',
    venue: { ...EMPTY_VENUE, name: { key: 'x|y', name: 'Rodanthe' } },
    kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' },
    positions: [],
    ...over,
  })

  it('collapses two entries the gazetteer calls one place', () => {
    const a = place({ placeId: 'mapbox-rodanthe', savedAt: '2026-10-01T10:00:00.000Z' })
    const b = place({
      placeId: 'mapbox-rodanthe',
      name: 'Rodanthe North Carolina',
      savedAt: '2026-10-05T10:00:00.000Z',
    })
    const merged = mergeSpots([a], [b])
    expect(merged).toHaveLength(1)
    // The more recent save wins.
    expect(merged[0].name).toBe('Rodanthe North Carolina')
  })

  /*
   * NEVER collapses hand-dropped pins. Two pins twenty metres apart are two
   * positions, one on the dock and one on the bank, and that distinction was
   * made on purpose.
   */
  it('keeps two hand-placed spots apart however close they are', () => {
    const a = place({ name: 'By the rail' })
    const b = place({ name: 'On the bank' })
    expect(mergeSpots([a], [b])).toHaveLength(2)
  })

  it('keeps places with different ids apart', () => {
    const a = place({ placeId: 'mapbox-rodanthe' })
    const b = place({ placeId: 'mapbox-salvo', name: 'Salvo' })
    expect(mergeSpots([a], [b])).toHaveLength(2)
  })

  it('survives a round trip through storage', () => {
    const a = place({ placeId: 'mapbox-rodanthe' })
    const back = reviveSpot(JSON.parse(JSON.stringify(a)))
    expect(back?.placeId).toBe('mapbox-rodanthe')
  })

  it('leaves placeId absent when there was none', () => {
    const back = reviveSpot(JSON.parse(JSON.stringify(place({}))))
    expect(back?.placeId).toBeUndefined()
  })
})

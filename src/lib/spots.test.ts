import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { defaultSelection } from './kitSelection.ts'
import {
  exportFilename,
  mergeSpots,
  parseSpotsFile,
  newSpotId,
  reviveSpot,
  reviveSpots,
  toFile,
  type Spot,
} from './spots.ts'
import { CALIBRATION_VENUE, EMPTY_VENUE } from './venue.ts'

const spot = (over: Partial<Spot> = {}): Spot => ({
  id: 'spot-1',
  name: 'Brew River',
  savedAt: '2026-09-12T12:00:00.000Z',
  venue: CALIBRATION_VENUE,
  subject: { lat: 38.3639, lon: -75.6058 },
  kit: defaultSelection(DEFAULT_KIT),
  positions: [],
  ...over,
})

describe('export and import round trip', () => {
  it('survives a full round trip through JSON', () => {
    const text = JSON.stringify(toFile([spot()]))
    const result = parseSpotsFile(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spots[0].name).toBe('Brew River')
    expect(result.spots[0].venue.latitude).toBe(CALIBRATION_VENUE.latitude)
    expect(result.spots[0].subject).toEqual({ lat: 38.3639, lon: -75.6058 })
  })

  it('accepts a bare array as well as the wrapped file', () => {
    expect(parseSpotsFile(JSON.stringify([spot()])).ok).toBe(true)
  })

  it('names the export file by date so it sorts', () => {
    expect(exportFilename(new Date('2026-09-12T00:00:00Z'))).toBe('scoutngo-spots-2026-09-12.json')
  })
})

describe('import is defensive, the file may be hand edited', () => {
  it('rejects text that is not JSON', () => {
    const result = parseSpotsFile('not json at all')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('not valid JSON')
  })

  it('rejects JSON with no spots in it', () => {
    expect(parseSpotsFile('{"hello":1}').ok).toBe(false)
  })

  it('skips unreadable entries and keeps the good ones', () => {
    const result = parseSpotsFile(JSON.stringify([spot(), { id: 5 }, null, 'nope']))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spots).toHaveLength(1)
    expect(result.skipped).toBe(3)
  })

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
    venue: { ...EMPTY_VENUE, name: 'Rodanthe' },
    subject: null,
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

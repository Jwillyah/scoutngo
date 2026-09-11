import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { defaultSelection } from './kitSelection.ts'
import {
  exportFilename,
  mergeSpots,
  parseSpotsFile,
  reviveSpots,
  toFile,
  type Spot,
} from './spots.ts'
import { CALIBRATION_VENUE } from './venue.ts'

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

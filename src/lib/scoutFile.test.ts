import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { defaultSelection } from './kitSelection.ts'
import { buildScoutFile, describeFile, readScoutFile, scoutFilename } from './scoutFile.ts'
import { SPOTS_FORMAT, type Spot } from './spots.ts'
import { CALIBRATION_VENUE } from './venue.ts'

const spot = (over: Partial<Spot> = {}): Spot => ({
  id: 'spot-1',
  name: 'Brew River',
  savedAt: '2026-09-12T12:00:00.000Z',
  venue: CALIBRATION_VENUE,
  kit: defaultSelection(DEFAULT_KIT),
  positions: [],
  ...over,
})

const withLens = {
  ...DEFAULT_KIT,
  lenses: [
    ...DEFAULT_KIT.lenses,
    {
      id: 'sony-70-200',
      name: 'Sony 70-200',
      minFocalLength: 70,
      maxFocalLength: 200,
      maxAperture: null,
      forcesSensor: [],
      notes: '',
    },
  ],
}

describe('one file carries kit, shelved gear, units and spots', () => {
  /*
   * THE REASON FOR THE FILE. Clearing Safari takes localStorage, and the kit
   * with it. Everything the shooter set up must come back from one file.
   */
  it('round-trips everything through JSON', () => {
    const text = JSON.stringify(
      buildScoutFile({
        kit: {
          profile: withLens,
          selection: defaultSelection(withLens, ['sony-75-300']),
          shelved: ['sony-75-300'],
        },
        units: { wind: 'mph', distance: 'm' },
        spots: [spot()],
      }),
    )
    const read = readScoutFile(text)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.file.kind).toBe('backup')
    expect(read.file.kit?.profile.lenses.map((l) => l.id)).toContain('sony-70-200')
    expect(read.file.kit?.shelved).toEqual(['sony-75-300'])
    /* Shelved gear does not come back in the bag, whatever the file says. */
    expect(read.file.kit?.selection.lensIds).not.toContain('sony-75-300')
    expect(read.file.units).toEqual({ wind: 'mph', distance: 'm' })
    expect(read.file.spots[0].name).toBe('Brew River')
  })

  it('a spots export is the same format carrying only spots', () => {
    const read = readScoutFile(JSON.stringify(buildScoutFile({ spots: [spot()] })))
    expect(read.ok && read.file.kind).toBe('spots')
    expect(read.ok && read.file.kit).toBeNull()
  })

  it('still reads the older spots-only files, wrapped or bare', () => {
    const wrapped = readScoutFile(JSON.stringify({ format: SPOTS_FORMAT, version: 1, spots: [spot()] }))
    const bare = readScoutFile(JSON.stringify([spot()]))
    expect(wrapped.ok && wrapped.file.kind).toBe('legacy-spots')
    expect(bare.ok && bare.file.spots).toHaveLength(1)
  })

  it('names the file by date so backups sort', () => {
    expect(scoutFilename('backup', new Date('2026-10-25T09:00:00Z'))).toBe(
      'scoutngo-backup-2026-10-25.json',
    )
  })
})

describe('reading is defensive, the file may be hand edited', () => {
  it('rejects text that is not JSON', () => {
    const read = readScoutFile('not json at all')
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.reason).toContain('not valid JSON')
  })

  it('rejects JSON that is not a ScoutNGo file', () => {
    expect(readScoutFile('{"hello":1}').ok).toBe(false)
  })

  it('refuses a file from a newer format rather than half-reading it', () => {
    const read = readScoutFile(JSON.stringify({ format: 'scoutngo', version: 99, spots: [spot()] }))
    expect(read.ok).toBe(false)
  })

  it('skips unreadable spots and says how many', () => {
    const read = readScoutFile(
      JSON.stringify({ format: 'scoutngo', version: 1, spots: [spot(), { id: 5 }, null] }),
    )
    expect(read.ok && read.file.skippedSpots).toBe(2)
    expect(read.ok && describeFile(read.file)).toContain('2 unreadable, left out')
  })

  /*
   * A LENS WITH NO FOCAL LENGTH IS DROPPED BY THE SAME REVIVER AS STORAGE USES.
   * A second, laxer reader here would put a lens on a card with a field of view
   * computed from undefined.
   */
  it('drops a malformed lens exactly as reloading would', () => {
    const broken = { ...withLens, lenses: [...withLens.lenses, { id: 'x', name: 'No focal' }] }
    const read = readScoutFile(
      JSON.stringify({
        format: 'scoutngo',
        version: 1,
        kit: { profile: broken, selection: {}, shelved: [] },
      }),
    )
    expect(read.ok && read.file.kit?.profile.lenses.map((l) => l.id)).not.toContain('x')
  })

  it('says what a file holds before anything is replaced', () => {
    const read = readScoutFile(
      JSON.stringify(
        buildScoutFile({
          kit: { profile: withLens, selection: defaultSelection(withLens), shelved: ['sony-75-300'] },
          units: { wind: 'kt', distance: 'ft' },
          spots: [spot()],
        }),
      ),
    )
    expect(read.ok && describeFile(read.file)).toBe(
      'kit: 2 bodies, 6 lenses, 1 drone, 1 shelved · units: wind in kt, distance in ft · 1 spot',
    )
  })
})

describe('version 2: a plan on its own', () => {
  const plan = {
    id: 'p1',
    name: 'Atlantic Park',
    savedAt: '2026-10-25T12:00:00.000Z',
    venue: { name: null, latitude: '36.84658', longitude: '-75.97666', date: '2026-10-25', startTime: '17:00', endTime: '18:30', eventDescription: '', desiredOutcome: '', subjectAcrossMeters: '' },
    kit: {},
    positions: [],
    marks: [],
  }

  it('writes version 2 and reads the plan back', () => {
    const file = buildScoutFile({ plan: plan as never })
    expect(file.version).toBe(2)
    const read = readScoutFile(JSON.stringify(file))
    expect(read.ok && read.file.kind).toBe('plan')
    expect(read.ok && read.file.plan?.name).toBe('Atlantic Park')
  })

  it('still reads a version 1 backup exactly as before, with no plan', () => {
    const v1 = { format: 'scoutngo', version: 1, exportedAt: '2026-10-01T00:00:00Z', units: { wind: 'kt', distance: 'ft' } }
    const read = readScoutFile(JSON.stringify(v1))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.file.plan).toBeNull()
    expect(read.file.kind).toBe('backup')
  })

  it('refuses a file from a newer app rather than half reading it', () => {
    const read = readScoutFile(JSON.stringify({ format: 'scoutngo', version: 3, exportedAt: '' }))
    expect(read.ok).toBe(false)
  })
})

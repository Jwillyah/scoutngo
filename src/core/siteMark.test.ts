import { describe, expect, it } from 'vitest'
import type { LatLon } from './geo.ts'
import {
  canBeDeciduous,
  DEFAULT_FOLIAGE,
  HAZARD_KINDS,
  isHazard,
  MARK_KINDS,
  MARK_LABEL,
  markPoints,
  NOTE_KINDS,
  tallyMarks,
  type SiteMark,
} from './siteMark.ts'

const AT: LatLon = { lat: 37.0869, lon: -76.4746 }
const mark = (over: Partial<SiteMark> = {}): SiteMark => ({
  id: 'm',
  kind: 'power-line',
  shape: { kind: 'point', at: AT },
  heightMeters: 11,
  foliage: 'solid',
  source: 'manual',
  confirmed: true,
  note: '',
  ...over,
})

describe('a hazard and a note are different things', () => {
  it('knows which is which', () => {
    for (const kind of HAZARD_KINDS) expect(isHazard(kind), kind).toBe(true)
    for (const kind of NOTE_KINDS) expect(isHazard(kind), kind).toBe(false)
  })

  it('has a name for every kind', () => {
    for (const kind of MARK_KINDS) {
      expect(MARK_LABEL[kind], kind).toBeTruthy()
      expect(MARK_LABEL[kind].length).toBeLessThan(14)
    }
  })

  it('covers the four hazards and the three notes the shooter asked for', () => {
    expect([...HAZARD_KINDS]).toEqual(['power-line', 'trees', 'building', 'structure'])
    expect([...NOTE_KINDS]).toEqual(['open-field', 'launch', 'parking'])
  })
})

describe('only a tree can lose its leaves', () => {
  it('starts trees deciduous and everything else solid', () => {
    expect(DEFAULT_FOLIAGE.trees).toBe('deciduous')
    for (const kind of MARK_KINDS) {
      if (kind === 'trees') continue
      expect(DEFAULT_FOLIAGE[kind], kind).toBe('solid')
    }
  })

  it('only asks about leaves where the question means something', () => {
    expect(canBeDeciduous('trees')).toBe(true)
    for (const kind of MARK_KINDS) {
      if (kind === 'trees') continue
      expect(canBeDeciduous(kind), kind).toBe(false)
    }
  })
})

describe('a mark is a point or a line', () => {
  it('reads the point out of a point', () => {
    expect(markPoints(mark())).toEqual([AT])
  })

  it('reads every vertex out of a line', () => {
    const path = [AT, { lat: 37.088, lon: -76.474 }, { lat: 37.089, lon: -76.473 }]
    expect(markPoints(mark({ shape: { kind: 'line', path } }))).toEqual(path)
  })
})

describe('the tally counts and does not conclude', () => {
  const marks = [
    mark({ id: 'a', kind: 'power-line', source: 'osm' }),
    mark({ id: 'b', kind: 'trees', heightMeters: null }),
    mark({ id: 'c', kind: 'parking', heightMeters: null }),
  ]

  it('separates hazards from notes', () => {
    const tally = tallyMarks(marks)
    expect(tally.hazards).toBe(2)
    expect(tally.notes).toBe(1)
  })

  it('says how many hazards carry a height, since only those reach the geometry', () => {
    expect(tallyMarks(marks).withHeight).toBe(1)
  })

  it('keeps the sources apart', () => {
    expect(tallyMarks(marks).bySource).toEqual({ osm: 1, manual: 2, model: 0 })
  })

  /*
   * THE HARD RULE, AS A SHAPE. An empty list tallies to zeros. There is no
   * field here that any screen could render as "clear", because there is no
   * such field: the tally has counts and nothing else, and that is deliberate.
   */
  it('returns zeros for an empty list, and no verdict of any kind', () => {
    const tally = tallyMarks([])
    expect(tally).toEqual({
      hazards: 0,
      notes: 0,
      withHeight: 0,
      bySource: { osm: 0, manual: 0, model: 0 },
    })
    for (const value of Object.values(tally)) {
      expect(typeof value === 'boolean').toBe(false)
    }
    expect(Object.keys(tally)).not.toContain('clear')
    expect(Object.keys(tally)).not.toContain('safe')
  })
})

/*
 * THE MODEL SEAM, BUILT AS A FIELD AND NOTHING ELSE. Nothing produces a
 * 'model' mark yet. When something does, it must arrive unconfirmed.
 */
describe('the model seam exists and is empty', () => {
  it('has a source for it and a confirmed flag to hold it back', () => {
    const proposal = mark({ source: 'model', confirmed: false })
    expect(proposal.source).toBe('model')
    expect(proposal.confirmed).toBe(false)
    expect(tallyMarks([proposal]).bySource.model).toBe(1)
  })
})

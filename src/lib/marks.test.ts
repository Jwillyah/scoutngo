import { describe, expect, it } from 'vitest'
import type { SiteMark } from '../core/siteMark.ts'
import { addMark, allMarks, makeMark, removeMark, reviveMarks, updateMark } from './marks.ts'
import { draftCollection, markCollection } from './markLayer.ts'

const AT = { lat: 37.0869, lon: -76.4746 }
const AT2 = { lat: 37.0875, lon: -76.474 }

describe('making a mark', () => {
  it('starts with no height, because nobody has said', () => {
    expect(makeMark('power-line', { kind: 'point', at: AT }).heightMeters).toBeNull()
  })

  it('starts a tree deciduous and everything else solid', () => {
    expect(makeMark('trees', { kind: 'point', at: AT }).foliage).toBe('deciduous')
    expect(makeMark('building', { kind: 'point', at: AT }).foliage).toBe('solid')
  })

  it('is the shooter own and confirmed', () => {
    const mark = makeMark('trees', { kind: 'point', at: AT })
    expect(mark.source).toBe('manual')
    expect(mark.confirmed).toBe(true)
  })

  it('gives every mark its own id', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => makeMark('trees', { kind: 'point', at: AT }).id),
    )
    expect(ids.size).toBe(50)
  })

  it('carries a line as a line', () => {
    const mark = makeMark('power-line', { kind: 'line', path: [AT, AT2] })
    expect(mark.shape).toEqual({ kind: 'line', path: [AT, AT2] })
  })
})

describe('changing a mark', () => {
  const list = [makeMark('trees', { kind: 'point', at: AT })]

  it('sets a height', () => {
    expect(updateMark(list, list[0].id, { heightMeters: 18 })[0].heightMeters).toBe(18)
  })

  it('clears a height back to null rather than to zero', () => {
    const withHeight = updateMark(list, list[0].id, { heightMeters: 18 })
    expect(updateMark(withHeight, list[0].id, { heightMeters: null })[0].heightMeters).toBeNull()
  })

  /*
   * CHANGING THE KIND RESETS THE LEAF ANSWER. A building that used to be a
   * tree would otherwise keep "deciduous" and quietly stop blocking in January.
   */
  it('makes a mark solid when it stops being a tree', () => {
    const was = updateMark(list, list[0].id, { foliage: 'deciduous' })
    expect(was[0].foliage).toBe('deciduous')
    const now = updateMark(was, list[0].id, { kind: 'building' })
    expect(now[0].kind).toBe('building')
    expect(now[0].foliage).toBe('solid')
  })

  it('refuses to make a building deciduous', () => {
    const wall = [makeMark('building', { kind: 'point', at: AT })]
    expect(updateMark(wall, wall[0].id, { foliage: 'deciduous' })[0].foliage).toBe('solid')
  })

  it('leaves every other mark alone', () => {
    const two = addMark(list, makeMark('building', { kind: 'point', at: AT2 }))
    expect(updateMark(two, two[0].id, { heightMeters: 9 })[1]).toEqual(two[1])
  })

  it('removes by id', () => {
    const two = addMark(list, makeMark('building', { kind: 'point', at: AT2 }))
    expect(removeMark(two, two[0].id).map((m) => m.id)).toEqual([two[1].id])
  })
})

/*
 * MARKS COME BACK OFF THE DEVICE AS JSON, so anything malformed is DROPPED
 * rather than patched. A wire drawn in the wrong place is worse than a wire
 * not drawn: it is a wire the shooter has been taught to trust.
 */
describe('reviving what is on the device', () => {
  const good = makeMark('power-line', { kind: 'line', path: [AT, AT2] })

  it('brings a well formed mark back whole', () => {
    expect(reviveMarks([good])).toEqual([good])
  })

  it('drops anything that is not a list', () => {
    for (const raw of [null, undefined, 'x', 7, {}]) expect(reviveMarks(raw)).toEqual([])
  })

  it('drops a mark with no id or an unknown kind', () => {
    expect(reviveMarks([{ ...good, id: '' }])).toEqual([])
    expect(reviveMarks([{ ...good, kind: 'volcano' }])).toEqual([])
  })

  it('drops a mark whose coordinates are not coordinates', () => {
    expect(reviveMarks([{ ...good, shape: { kind: 'point', at: { lat: 'x', lon: 1 } } }])).toEqual([])
    expect(reviveMarks([{ ...good, shape: { kind: 'point', at: { lat: 200, lon: 1 } } }])).toEqual([])
    expect(reviveMarks([{ ...good, shape: null }])).toEqual([])
  })

  /* A line needs two points. One point is not a span of anything. */
  it('drops a line with fewer than two points', () => {
    expect(reviveMarks([{ ...good, shape: { kind: 'line', path: [AT] } }])).toEqual([])
  })

  it('drops the bad ones and keeps the good ones in the same list', () => {
    expect(reviveMarks([good, { kind: 'volcano' }, null, 'x'])).toEqual([good])
  })

  /* A height that is not a positive number becomes null, never zero. */
  it('turns a nonsense height into null', () => {
    for (const bad of ['tall', 0, -4, NaN, null, undefined]) {
      expect(reviveMarks([{ ...good, heightMeters: bad }])[0].heightMeters).toBeNull()
    }
    expect(reviveMarks([{ ...good, heightMeters: 11 }])[0].heightMeters).toBe(11)
  })

  /* A model proposal that somehow persisted comes back UNCONFIRMED. */
  it('never revives a model proposal as confirmed', () => {
    const revived = reviveMarks([{ ...good, source: 'model', confirmed: true }])
    expect(revived[0].source).toBe('model')
    expect(revived[0].confirmed).toBe(true)
    const unconfirmed = reviveMarks([{ ...good, source: 'model', confirmed: false }])
    expect(unconfirmed[0].confirmed).toBe(false)
  })

  it('treats an unknown source as the shooter own', () => {
    expect(reviveMarks([{ ...good, source: 'aliens' }])[0].source).toBe('manual')
  })
})

/*
 * OSM MARKS ARE NOT PERSISTED. They belong to a bounding box and a moment, and
 * a stale copy would draw wires from a box the shooter has since left.
 */
describe('combining the shooter own marks with the OSM layer', () => {
  it('draws OSM first so the shooter own marks sit over them', () => {
    const mine = makeMark('trees', { kind: 'point', at: AT })
    const theirs: SiteMark = { ...mine, id: 'osm-1', source: 'osm' }
    expect(allMarks([mine], [theirs]).map((m) => m.source)).toEqual(['osm', 'manual'])
  })

  it('is just the shooter own when OSM returned nothing', () => {
    const mine = makeMark('trees', { kind: 'point', at: AT })
    expect(allMarks([mine], [])).toEqual([mine])
  })
})

describe('what gets drawn', () => {
  it('draws a point as one feature', () => {
    const mark = makeMark('trees', { kind: 'point', at: AT })
    const { features } = markCollection([mark])
    expect(features).toHaveLength(1)
    expect(features[0].geometry.type).toBe('Point')
  })

  /*
   * A LINE DRAWS ITS ENDS TOO. A line two pixels wide is hard to find with a
   * thumb, and the ends are where the poles are.
   */
  it('draws a line plus a node at each vertex', () => {
    const mark = makeMark('power-line', { kind: 'line', path: [AT, AT2] })
    const { features } = markCollection([mark])
    expect(features.map((f) => f.geometry.type)).toEqual(['LineString', 'Point', 'Point'])
  })

  it('carries the source and the confirmation onto every feature', () => {
    const mark: SiteMark = { ...makeMark('power-line', { kind: 'line', path: [AT, AT2] }), source: 'osm' }
    for (const feature of markCollection([mark]).features) {
      expect(feature.properties?.source).toBe('osm')
      expect(feature.properties?.confirmed).toBe(true)
      expect(feature.properties?.hazard).toBe(true)
    }
  })

  it('marks a note as not a hazard, so it draws differently', () => {
    const note = makeMark('parking', { kind: 'point', at: AT })
    expect(markCollection([note]).features[0].properties?.hazard).toBe(false)
  })

  /* A missing height travels as -1, because a filter expression cannot read null. */
  it('encodes a missing height as -1 rather than 0', () => {
    const mark = makeMark('trees', { kind: 'point', at: AT })
    expect(markCollection([mark]).features[0].properties?.height).toBe(-1)
  })

  it('draws nothing for an empty list', () => {
    expect(markCollection([]).features).toEqual([])
  })
})

describe('the line being drawn is not a mark', () => {
  it('draws nothing before the first tap', () => {
    expect(draftCollection([]).features).toEqual([])
  })

  it('draws a node after one tap and no line yet', () => {
    const { features } = draftCollection([AT])
    expect(features).toHaveLength(1)
    expect(features[0].geometry.type).toBe('Point')
  })

  it('draws the line once there are two', () => {
    const { features } = draftCollection([AT, AT2])
    expect(features.map((f) => f.geometry.type)).toEqual(['Point', 'Point', 'LineString'])
  })

  /* It carries no kind and no id: there is nothing to compute from it. */
  it('carries no identity, so nothing can treat it as a hazard', () => {
    for (const feature of draftCollection([AT, AT2]).features) {
      expect(feature.properties?.draft).toBe(true)
      expect(feature.properties?.id).toBeUndefined()
      expect(feature.properties?.kind).toBeUndefined()
      expect(feature.properties?.hazard).toBeUndefined()
    }
  })
})

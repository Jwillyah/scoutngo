import { describe, expect, it } from 'vitest'
import {
  EVENT_TYPES,
  MAX_ELEMENTS,
  MAX_PATH_POINTS,
  parseEventElements,
  parseEventPlacements,
  POINTS_FOR,
  SHAPE_OF,
  type EventElement,
} from './eventLayout.ts'

const pts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: 0.1 + i * 0.01, y: 0.2 + i * 0.01 }))

const extract = (elements: unknown) => parseEventElements(JSON.stringify({ elements }))

const course = { type: 'course', label: 'Race course', points: pts(6) }
const start = { type: 'start', label: 'Start', points: pts(1) }
const crowd = { type: 'crowd', label: 'Spectator bank', points: pts(4) }

describe('the type set is closed', () => {
  it('carries the nine the organizer graphics actually show', () => {
    expect([...EVENT_TYPES]).toEqual([
      'course', 'start', 'finish', 'turn',
      'crowd', 'vendors', 'food', 'stage', 'restricted',
    ])
  })

  /*
   * Shape is fixed by type rather than chosen by the model. A start line is a
   * point and a crowd is an area whatever the artwork looks like, and letting
   * the model pick adds a failure mode for no gain.
   */
  it('fixes the shape by type', () => {
    expect(SHAPE_OF.course).toBe('path')
    expect(SHAPE_OF.turn).toBe('point')
    expect(SHAPE_OF.crowd).toBe('area')
    for (const type of EVENT_TYPES) expect(SHAPE_OF[type]).toBeDefined()
  })
})

describe('parseEventElements', () => {
  it('reads a course, a start and a crowd area', () => {
    const result = extract([course, start, crowd])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements.map((e) => e.type)).toEqual(['course', 'start', 'crowd'])
    expect(result.elements.map((e) => e.shape)).toEqual(['path', 'point', 'area'])
    expect(result.dropped).toBe(0)
  })

  /* Ids are assigned by this code. A model-supplied id is a supplied primary key. */
  it('assigns its own ids, ignoring any the model sends', () => {
    const result = extract([{ ...course, id: 'HACK' }, start])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('drops a type outside the set rather than mapping it to the nearest', () => {
    const result = extract([course, { type: 'hospitality marquee', points: pts(4) }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements).toHaveLength(1)
    expect(result.dropped).toBe(1)
  })

  /* A crowd area with two corners is not an area, and it would feed a
     degenerate ring to the siting check. */
  it('drops a shape that has too few points to be that shape', () => {
    const result = extract([course, { type: 'crowd', points: pts(2) }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements.map((e) => e.type)).toEqual(['course'])
    expect(result.dropped).toBe(1)
  })

  it('caps a windy course at a correctable number of handles', () => {
    const result = extract([{ type: 'course', points: pts(60) }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements[0].layoutPoints).toHaveLength(MAX_PATH_POINTS)
  })

  it('caps the element count', () => {
    const result = extract(Array.from({ length: 40 }, () => crowd))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements).toHaveLength(MAX_ELEMENTS)
  })

  it('trims a rambling label', () => {
    const result = extract([
      { ...start, label: 'the official start line for the parade of boats on saturday morning' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements[0].label.split(' ').length).toBeLessThanOrEqual(7)
  })

  /*
   * THE MODEL NEVER RETURNS COORDINATES. There is no latitude field in the
   * shape, so one sent anyway lands nowhere.
   */
  it('has nowhere to put a latitude, so one sent is simply gone', () => {
    const result = extract([{ ...start, lat: 39.527, lon: -75.81 }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(JSON.stringify(result.elements[0])).not.toContain('39.5')
    expect(JSON.stringify(result.elements[0])).not.toContain('lat')
  })

  it('survives prose, fences and junk instead of dead ending', () => {
    expect(parseEventElements('Here you go:\n```json\n{"elements":[]}\n```').ok).toBe(false)
    expect(parseEventElements('I could not read that image.').ok).toBe(false)
    expect(parseEventElements('{"elements":[{"type":"course"').ok).toBe(false)
    const cut = parseEventElements('{"elements":[{"type":"course"')
    expect(cut.ok === false && cut.reason).toMatch(/cut off/)
  })

  it('returns the raw text on failure, so the reader sees what came back', () => {
    const result = parseEventElements('nope')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.raw).toBe('nope')
  })
})

describe('parseEventPlacements', () => {
  const elements: EventElement[] = (() => {
    const r = extract([course, start, crowd])
    return r.ok ? r.elements : []
  })()

  const place = (placements: unknown) =>
    parseEventPlacements(JSON.stringify({ placements }), elements)

  it('joins placements to elements by id', () => {
    const result = place([
      { id: 'e1', points: pts(6) },
      { id: 'e2', points: pts(1) },
      { id: 'e3', points: pts(4) },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements.map((p) => p.id)).toEqual(['e1', 'e2', 'e3'])
    expect(result.unplaced).toEqual([])
  })

  /* An unknown id is the model inventing an element at placement time. */
  it('drops an id that matches no element', () => {
    const result = place([{ id: 'e1', points: pts(6) }, { id: 'e99', points: pts(1) }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements.map((p) => p.id)).toEqual(['e1'])
    expect(result.dropped).toBe(1)
  })

  it('reports what it could not place rather than guessing a spot', () => {
    const result = place([{ id: 'e1', points: pts(6) }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.unplaced).toEqual(['e2', 'e3'])
  })

  /*
   * OFF-FRAME VERTICES ARE DROPPED, NEVER CLAMPED. Clamping would draw a course
   * that bends where the screen ends, which is a lie about the geography.
   */
  it('drops vertices outside the capture and counts them', () => {
    const result = place([
      { id: 'e1', points: [{ x: 0.2, y: 0.3 }, { x: 1.4, y: 0.3 }, { x: 0.5, y: -0.2 }, { x: 0.6, y: 0.7 }] },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements[0].points).toEqual([{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }])
    expect(result.placements[0].droppedOffFrame).toBe(2)
  })

  it('leaves an element unplaced when too little of it is in frame', () => {
    const result = place([
      { id: 'e3', points: [{ x: 0.2, y: 0.3 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }] },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements).toEqual([])
    expect(result.unplaced).toContain('e3')
  })

  it('ignores a repeated id rather than placing the same thing twice', () => {
    const result = place([{ id: 'e1', points: pts(6) }, { id: 'e1', points: pts(4) }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placements).toHaveLength(1)
    expect(result.dropped).toBe(1)
  })

  it('keeps every placement inside the unit square', () => {
    const result = place([{ id: 'e1', points: pts(6) }, { id: 'e3', points: pts(4) }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const placement of result.placements) {
      for (const point of placement.points) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(1)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(1)
      }
    }
  })

  it('respects the per-shape point bounds', () => {
    expect(POINTS_FOR.point).toEqual({ min: 1, max: 1 })
    expect(POINTS_FOR.area.min).toBe(3)
    expect(POINTS_FOR.path.min).toBe(2)
  })

  it('survives junk', () => {
    expect(parseEventPlacements('nope', elements).ok).toBe(false)
    expect(parseEventPlacements('{"wrong":[]}', elements).ok).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { droneLadder, fewCards, firstFun, homeCardsShown, homeLayout, nextLine, nightSpans, surfPath, tideAt, tideCurve, windAtFeet } from '../src/core/homeCards.ts'
import { awayFrom, beachFor, namedBeach } from '../src/lib/surfBeach.ts'

/* The home in look D (Batch Flow, Section 3; boards D_Home6, D_Home2). */
const T0 = new Date('2026-11-09T23:00:00Z')
const h = (k: number) => new Date(T0.getTime() + k * 3_600_000)
const clock = (d: Date) => `${d.getUTCHours()}h`

describe('the layout follows the picker', () => {
  it('1-3 picked: few, big cards; 4-6 or nothing picked yet: the six', () => {
    expect(homeLayout(['surf'])).toBe('few')
    expect(homeLayout(['surf', 'drone', 'shoot'])).toBe('few')
    expect(homeLayout(['surf', 'drone', 'shoot', 'fish'])).toBe('many')
    expect(homeLayout(null)).toBe('many')
    expect(homeLayout([])).toBe('many')
  })
  it('few: each activity its own cards (a surfer: surf, wind, tide); the drone only with a drone', () => {
    expect(fewCards(['surf'], false)).toEqual(['surf', 'wind', 'tide'])
    expect(fewCards(['shoot'], false)).toEqual(['sky', 'moon'])
    expect(fewCards(['drone'], true)).toEqual(['drone', 'wind'])
    expect(fewCards(['drone'], false)).toEqual(['wind'])
    expect(fewCards(['surf', 'drone', 'shoot'], true)).toEqual(['surf', 'drone', 'sky'])
  })
})

describe('the surf card', () => {
  const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ at: h(k), ft: 1 + k * 0.3, fun: k >= 4 }))
  it('"Fun 7 AM": the first Fun hour ahead; "now" inside the hour; none: null', () => {
    expect(firstFun(pts, h(0))).toEqual(h(4))
    expect(firstFun(pts, h(4))).toBe('now')
    expect(firstFun(pts.map((p) => ({ ...p, fun: false })), h(0))).toBeNull()
  })
  it('the chart spans the window left to right and fills to the floor', () => {
    const p = surfPath(pts, h(0), 8, { w: 300, h: 70 })
    expect(p?.line.startsWith('M0.0 ')).toBe(true)
    expect(p?.line).toContain('L300.0 ')
    expect(p?.fill.endsWith('Z')).toBe(true)
  })
  it('the night is shaded from sunset to sunrise inside the window', () => {
    expect(nightSpans(h(0), 24, [h(2)], [h(14)])).toEqual([{ a: 2 / 24, b: 14 / 24 }])
    /* Already dark at the start (the last event a sunset): from the start. */
    expect(nightSpans(h(0), 24, [h(-3)], [h(8)])).toEqual([{ a: 0, b: 8 / 24 }])
  })
})

describe('the tide card', () => {
  const turns = [
    { at: h(0), kind: 'low' as const, feet: 0.3 },
    { at: h(6), kind: 'high' as const, feet: 4.3 },
    { at: h(12), kind: 'low' as const, feet: 0.4 },
  ]
  it('a half cosine between turns, at the turns their own heights', () => {
    expect(tideAt(turns, h(0))).toBeCloseTo(0.3)
    expect(tideAt(turns, h(3))).toBeCloseTo(2.3)
    expect(tideAt(turns, h(6))).toBeCloseTo(4.3)
    expect(tideAt(turns, h(20))).toBeNull()
  })
  it('the curve places every turn inside the window, to be labelled', () => {
    const c = tideCurve(turns, h(-1), 14, { w: 300, h: 70 })
    expect(c?.turns.map((t) => t.turn.kind)).toEqual(['low', 'high', 'low'])
    expect(c?.turns[1].x).toBeCloseTo((7 / 14) * 300)
  })
})

describe('the drone card', () => {
  it('the wind at 200 ft between the forecast 10 m and 120 m, on a log of the height', () => {
    expect(windAtFeet(2, 6, 400)).toBeCloseTo(6, 0)
    const at200 = windAtFeet(2, 6, 200) as number
    expect(at200).toBeGreaterThan(2)
    expect(at200).toBeLessThan(6)
    expect(windAtFeet(null, 6, 200)).toBeNull()
    expect(droneLadder(2, 6).map((r) => r.label)).toEqual(['400', '200', 'gnd'])
  })
})

describe('the Next line', () => {
  it('the two soonest still to come, "now" for one under way', () => {
    expect(nextLine([{ what: 'drone calm', from: h(2) }, { what: 'surf on', from: h(1) }, { what: 'calm water', from: h(5) }], h(0), clock)).toBe(`surf on from ${clock(h(1))} · drone calm from ${clock(h(2))}`)
    expect(nextLine([{ what: 'surf on', from: h(0) }], h(0), clock)).toBe('surf on now')
    expect(nextLine([], h(0), clock)).toBeNull()
  })
})

describe('a named beach is its own beach (field 9 Nov: "Sandbridge" said "Nearest surf: Virginia Beach")', () => {
  it('a spot named Sandbridge snaps to Sandbridge, its pin in the town inland', () => {
    const inland = { lat: 36.705, lon: -75.985 }
    expect(namedBeach(inland, 'Sandbridge')?.name).toBe('Sandbridge')
    expect(namedBeach(inland, 'Sandbridge Beach')?.name).toBe('Sandbridge')
    expect(beachFor(inland, null, 'Sandbridge')?.name).toBe('Sandbridge')
  })
  it('a name far from that beach, or no name, is the nearest beach as before', () => {
    expect(namedBeach({ lat: 38.3, lon: -75.1 }, 'Sandbridge')).toBeNull()
    expect(namedBeach({ lat: 36.705, lon: -75.985 }, null)).toBeNull()
  })
})

describe('the cards the home shows, which the menu lists (Batch Flow, Section 8)', () => {
  it('few: surf alone is surf, wind, tide; many: the six', () => {
    /* Batch QA, Section 0B: a drone in the kit is not Drone picked. */
    expect(homeCardsShown(['surf'], ['surf', 'drone'], true)).toEqual(['surf', 'wind', 'tide'])
    expect(homeCardsShown(['surf', 'shoot', 'drone', 'fish'], ['surf', 'shoot', 'drone', 'fish'], true)).toContain('drone')
  })
  it('picked: no Drone unless Drone is, no Tide unless Surf or Fish is (Batch QA, Section 0B, "Just weather")', () => {
    expect(homeCardsShown(['weather'], ['weather', 'drone'], true)).toEqual(['wind'])
    expect(homeCardsShown(['weather', 'drone'], ['weather', 'drone'], true)).toEqual(['wind', 'drone'])
    expect(homeCardsShown(['fish'], ['fish'], false)).toEqual(['wind', 'tide'])
    expect(homeCardsShown(['shoot', 'weather', 'surf', 'fish'], ['shoot', 'weather', 'surf', 'fish', 'drone'], true)).not.toContain('drone')
  })
  it('nothing picked: Surf, Wind, Tide, Sky, Drone, Moon, the Moon last (Batch QA, Section 0)', () => {
    expect(homeCardsShown(null, ['surf', 'shoot', 'fish', 'weather', 'drone'], true)).toEqual(['surf', 'wind', 'tide', 'sky', 'drone', 'moon'])
    expect(homeCardsShown([], ['surf', 'shoot', 'fish', 'weather'], false)).toEqual(['surf', 'wind', 'tide', 'sky', 'moon'])
  })
})

describe('a spot on a beach is on that beach (Batch QA, Section 0B, field 10 Nov)', () => {
  const pier = { lat: 36.8435575, lon: -75.9713104 }
  const northEnd = { name: 'Virginia Beach', at: { lat: 36.88, lon: -75.981 } }
  it('the pier, with North End picked elsewhere: the pier’s own beach, never "Nearest surf"', () => {
    const b = beachFor(pier, northEnd, 'Virginia Beach Fishing Pier')
    expect(b?.name).toBe('Virginia Beach Pier')
    expect(awayFrom(pier, b, 'Virginia Beach Fishing Pier')).toBe(false)
  })
  it('inland, a pick still holds, and is away', () => {
    const inland = { lat: 36.78, lon: -76.1 }
    expect(beachFor(inland, northEnd, null)?.name).toBe('Virginia Beach')
    expect(awayFrom(inland, northEnd, null)).toBe(true)
  })
})

describe('a drone in the kit is not Drone picked (Batch QA, Section 0B)', () => {
  it('nothing picked: the kit drone joins; picked: only when Drone was', async () => {
    const { homeOrder } = await import('../src/lib/activities.ts')
    expect(homeOrder(null, true)).toContain('drone')
    expect(homeOrder(['weather'], true)).toEqual(['weather'])
    expect(homeOrder(['weather', 'drone'], true)).toEqual(['weather', 'drone'])
  })
})

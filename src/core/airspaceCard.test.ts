import { describe, expect, it } from 'vitest'
import { airspaceCard, CHECKED_NOTHING, TODAY_LINE } from './airspaceCard.ts'
import type { ParkUnit, SpecialUseArea } from './restrictions.ts'

const base = { classes: [], gridCeilingFeet: null, specialUse: [], parks: [], droneFeet: 200 }
const area = (over: Partial<SpecialUseArea>): SpecialUseArea => ({
  type: 'R',
  name: 'R-6604',
  floor: 0,
  floorUom: 'FT',
  floorRef: 'SFC',
  ceiling: 18000,
  ceilingUom: 'FT',
  agency: 'FACSFAC VACAPES',
  times: '0700-2300 LOCAL',
  state: 'VA',
  rings: [],
  bbox: [0, 0, 0, 0],
  ...over,
})
const SHEN: ParkUnit = {
  code: 'SHEN',
  name: 'Shenandoah National Park',
  /* As baked: plural. */
  unitType: 'National Parks',
  state: 'VA',
  rings: [],
  bbox: [0, 0, 0, 0],
}
const text = (lines: ReturnType<typeof airspaceCard>) => lines.map((l) => `${l.text} ${l.detail}`).join(' ')

describe('the card in plain words', () => {
  it("says the brief's own line for a controlled grid square", () => {
    const lines = airspaceCard({ ...base, classes: ['D'], gridCeilingFeet: 200 })
    expect(lines[0].text).toBe('Controlled airspace. Needs LAANC. Grid ceiling here: 200 ft.')
  })

  it('says a 0 ft square cannot go through LAANC', () => {
    expect(text(airspaceCard({ ...base, classes: ['C'], gridCeilingFeet: 0 }))).toMatch(
      /cannot be approved through LAANC/,
    )
  })

  it('names a restricted area and who controls it', () => {
    const lines = airspaceCard({ ...base, specialUse: [area({})] })
    expect(lines[0]).toMatchObject({
      tone: 'hazard',
      text: 'Restricted area R-6604. No flying without the controlling agency.',
    })
    expect(lines[0].detail).toContain('FACSFAC VACAPES')
  })

  it('says a prohibited area is no flying', () => {
    expect(airspaceCard({ ...base, specialUse: [area({ type: 'P', name: 'P-56' })] })[0].text).toBe(
      'Prohibited area P-56. No flying.',
    )
  })

  it('reports an area whose floor is above the drone as overhead, not as a block', () => {
    const lines = airspaceCard({ ...base, specialUse: [area({ floor: 18000, floorRef: 'MSL' })] })
    expect(lines[0].tone).toBe('note')
    expect(lines[0].text).toContain('overhead')
  })

  it('says a trail or seashore is park service land, not a national park', () => {
    const trail = { ...SHEN, code: 'APPA', name: 'Appalachian National Scenic Trail', unitType: 'National Scenic Trails' }
    expect(airspaceCard({ ...base, parks: [trail] })[0].text).toBe(
      'Appalachian National Scenic Trail. No drone launch on National Park Service land.',
    )
  })

  it('says no drone launch in a national park', () => {
    expect(airspaceCard({ ...base, parks: [SHEN] })[0].text).toBe(
      'Shenandoah National Park. No drone launch in a national park.',
    )
  })
})

/*
 * NEVER A PERMISSION. The empty card says what was checked, and every card
 * ends on today's restrictions not being checked.
 */
describe('it never says an area is open', () => {
  const FORBIDDEN = [/\bclear\b/i, /\bsafe\b/i, /\ballowed\b/i, /\bno restrictions?\b/i, /\bfree to fly\b/i, /\bok to fly\b/i, /—/]
  const cases = [
    airspaceCard(base),
    airspaceCard({ ...base, classes: ['D'], gridCeilingFeet: 200 }),
    airspaceCard({ ...base, specialUse: [area({})], parks: [SHEN] }),
  ]

  it('the empty card says what was checked, not that it is open', () => {
    expect(cases[0][0].text).toBe(CHECKED_NOTHING)
  })

  it("every card ends with today's restrictions not checked", () => {
    for (const lines of cases) expect(lines.at(-1)).toEqual(TODAY_LINE)
  })

  it('no line uses a word that grants permission, or an em dash', () => {
    for (const lines of cases) {
      for (const pattern of FORBIDDEN) expect(text(lines)).not.toMatch(pattern)
    }
  })
})

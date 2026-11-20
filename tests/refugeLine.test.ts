import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { airspaceCard, airspaceLead, groundLines, REFUGE_RULE, refugeLine, type AirspaceAtPoint } from '../src/core/airspaceCard.ts'
import { airspaceLayer } from '../src/core/airspaceLayer.ts'
import { decodeRefuge, refugesAt, type EncodedRefuge } from '../src/core/restrictions.ts'
import { REFUGES, REFUGES_COORD_PRECISION } from '../src/data/refuges.ts'

/*
 * THE GREAT DISMAL SWAMP (Batch SIMPLE-1, Section 3).
 *
 * Near Suffolk, VA another drone app drew the Great Dismal Swamp National
 * Wildlife Refuge and this one said nothing was marked. The refuges are now
 * baked beside the national parks (scripts/bake-refuges.mjs) and the Drone
 * page's sheet says "Great Dismal Swamp · National Wildlife Refuge · drone
 * use needs refuge permission" over one.
 *
 * The fixture is the real refuge, as baked on 18 Nov from the Fish and
 * Wildlife Service's boundary service (8 rings, 388 points, generalised at
 * 0.00025°): tests/data/fws-great-dismal-swamp-2026-11-18.json.
 */
const fixture = JSON.parse(readFileSync('tests/data/fws-great-dismal-swamp-2026-11-18.json', 'utf8')) as { precision: number; refuge: EncodedRefuge }
const GDS = decodeRefuge(fixture.refuge, fixture.precision)

/*
 * In the City of Suffolk, east of US-13 (which leaves downtown, -76.58,
 * south-west towards Whaleyville, so everything south of downtown and east
 * of its longitude is east of the road): the refuge's west side, off the
 * Washington Ditch, and Lake Drummond in its middle. Each is more than a
 * kilometre inside the baked edge, far beyond its 0.00025° generalisation.
 */
const WASHINGTON_DITCH_EAST = { lat: 36.645, lon: -76.5 }
const LAKE_DRUMMOND = { lat: 36.605, lon: -76.465 }
/* Downtown Suffolk, Main St at the courthouse: outside. */
const DOWNTOWN_SUFFOLK = { lat: 36.7282, lon: -76.5836 }

const here = (over: Partial<AirspaceAtPoint>): AirspaceAtPoint => ({ classes: [], gridCeilingFeet: null, specialUse: [], parks: [], refuges: [], droneFeet: 400, ...over })

describe('the Great Dismal Swamp refuge, from the lookup to the sheet', () => {
  it('the fixture is the refuge, with its shape', () => {
    expect(GDS.name).toBe('Great Dismal Swamp National Wildlife Refuge')
    expect(GDS.code).toBe('51580')
    /* Something to look inside: not an empty or degenerate shape (failure mode B). */
    expect(GDS.rings.reduce((n, r) => n + r.length / 2, 0)).toBeGreaterThan(100)
  })

  it('a Suffolk point east of US-13 is inside, and the sheet says the refuge line', () => {
    for (const at of [WASHINGTON_DITCH_EAST, LAKE_DRUMMOND]) {
      const found = refugesAt([GDS], at)
      expect(found.map((r) => r.name)).toEqual(['Great Dismal Swamp National Wildlife Refuge'])
      expect(groundLines(here({ refuges: found }))).toEqual([
        { text: 'Great Dismal Swamp · National Wildlife Refuge · drone use needs refuge permission', tone: 'hazard' },
      ])
    }
  })

  it('downtown Suffolk is not inside, and no refuge line is said', () => {
    const found = refugesAt([GDS], DOWNTOWN_SUFFOLK)
    expect(found).toEqual([])
    expect(groundLines(here({ refuges: found }))).toEqual([])
  })

  it('the Plan card leads with the refuge, never with "nothing marked"', () => {
    const lines = airspaceCard(here({ refuges: refugesAt([GDS], WASHINGTON_DITCH_EAST) }))
    expect(airspaceLead(lines, null)).toBe('Great Dismal Swamp · National Wildlife Refuge · drone use needs refuge permission')
    expect(lines[0].detail).toMatch(/50 CFR 27\.34/)
    expect(lines.map((l) => l.text).join(' ')).not.toMatch(/nothing/i)
  })

  it('the map draws it with the parks, under the same toggle', () => {
    const view = { south: 36.6, west: -76.55, north: 36.7, east: -76.45 }
    const out = airspaceLayer({ view, classShapes: [], specialUse: [], parks: [], refuges: [GDS], ceilingAt: () => null, cellsPerDegree: 120 })
    const drawn = out.collection.features.filter((f) => f.properties?.kind === 'park' && f.properties.agency === 'fws')
    expect(drawn.map((f) => f.properties?.draw).sort()).toEqual(['fill', 'line'])
  })
})

describe('the refuge line', () => {
  it('is the brief’s words after the refuge’s own name', () => {
    expect(REFUGE_RULE).toBe('National Wildlife Refuge · drone use needs refuge permission')
    expect(refugeLine({ name: 'Back Bay National Wildlife Refuge' })).toBe('Back Bay · National Wildlife Refuge · drone use needs refuge permission')
    /* A refuge-system unit whose name does not end in the words keeps its own. */
    expect(refugeLine({ name: 'National Elk Refuge' })).toBe('National Elk Refuge · National Wildlife Refuge · drone use needs refuge permission')
  })

  it('never says clear, safe, open or allowed', () => {
    expect(refugeLine({ name: 'Back Bay National Wildlife Refuge' })).not.toMatch(/\b(clear|safe|open|allowed|permitted)\b/i)
  })
})

describe('the baked file agrees with the fixture', () => {
  const baked = REFUGES.map((r) => decodeRefuge(r, REFUGES_COORD_PRECISION))

  it('holds the country’s refuges, not a handful', () => {
    expect(baked.length).toBeGreaterThan(500)
  })

  it('answers the same at the same three points', () => {
    expect(refugesAt(baked, WASHINGTON_DITCH_EAST).map((r) => r.name)).toEqual(['Great Dismal Swamp National Wildlife Refuge'])
    expect(refugesAt(baked, LAKE_DRUMMOND).map((r) => r.name)).toEqual(['Great Dismal Swamp National Wildlife Refuge'])
    expect(refugesAt(baked, DOWNTOWN_SUFFOLK)).toEqual([])
  })
})

describe('the Drone page counts a refuge as marked', () => {
  it('DronePage feeds refuges into the preflight Airspace row', () => {
    const src = readFileSync('src/components/DronePage.tsx', 'utf8')
    expect(src).toMatch(/here\.specialUse\.length \+ here\.parks\.length \+ here\.refuges\.length/)
  })
})

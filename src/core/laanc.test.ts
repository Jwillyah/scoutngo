import { describe, expect, it } from 'vitest'
import type { FacilityCell } from './faaGrid.ts'
import {
  ROUTE_LABEL,
  ROUTE_TIMING,
  laancPath,
  laancWhy,
  surfaceClasses,
  type LaancPath,
} from './laanc.ts'

const cell = (over: Partial<FacilityCell> = {}): FacilityCell => ({
  ceilingFeet: 400,
  classes: ['D'],
  icao: 'KAAA',
  facility: 'Alpha Field',
  routes: ['107-AA', '107-FC'],
  ...over,
})

describe('the three branches that were asked for', () => {
  it('ceiling at or above the altitude is the auto-approval route', () => {
    const path = laancPath(cell({ ceilingFeet: 200 }), 150)
    expect(path.route).toBe('auto-approval')
    expect(path).toMatchObject({ ceilingFeet: 200, altitudeFeet: 150 })
  })

  /*
   * AT the ceiling, not just under it. The published ceiling is the maximum
   * altitude that can be auto-approved, so equality is inside the band. A
   * strict comparison would push every round number at a 400ft cell onto the
   * ninety-day path, which is the most common case there is.
   */
  it('treats an altitude exactly at the ceiling as inside the band', () => {
    expect(laancPath(cell({ ceilingFeet: 200 }), 200).route).toBe('auto-approval')
    expect(laancPath(cell({ ceilingFeet: 400 }), 400).route).toBe('auto-approval')
  })

  it('above the ceiling but above zero is further coordination', () => {
    const path = laancPath(cell({ ceilingFeet: 100 }), 200)
    expect(path.route).toBe('further-coordination')
    expect(path).toMatchObject({ ceilingFeet: 100, altitudeFeet: 200 })
  })

  it('a zero ceiling is the manual route whatever the altitude', () => {
    for (const altitude of [10, 100, 400]) {
      const path = laancPath(cell({ ceilingFeet: 0 }), altitude)
      expect(path.route, `at ${altitude}ft`).toBe('manual')
      expect(path.route === 'manual' && path.reason).toBe('ceiling-zero')
    }
  })

  it('outside coverage is the manual route and carries no ceiling', () => {
    const path = laancPath(null, 200)
    expect(path.route).toBe('manual')
    expect(path.route === 'manual' && path.reason).toBe('outside-coverage')
    expect(path.cell).toBeNull()
    /* There is no ceiling field to misread as a measured zero. */
    expect('ceilingFeet' in path).toBe(false)
  })
})

/*
 * THE FOURTH BRANCH, WHICH THE THREE-BRANCH RULE GETS WRONG.
 *
 * 22,213 cells in the shipped extract carry a non-zero ceiling at a facility
 * the FAA lists NO Part 107 LAANC route for. The ceiling-only rule calls those
 * auto-approval and promises minutes; the real path is a manual application.
 * That is wrong in the one direction that costs a shoot day.
 */
describe('the route is read from the data, not inferred from the ceiling', () => {
  it('does not promise auto-approval where no auto-approval route exists', () => {
    const path = laancPath(cell({ ceilingFeet: 150, routes: [] }), 100)
    expect(path.route).toBe('manual')
    expect(path.route === 'manual' && path.reason).toBe('no-auto-route')
  })

  it('does not promise further coordination where that route does not exist', () => {
    const path = laancPath(cell({ ceilingFeet: 100, routes: ['107-AA'] }), 300)
    expect(path.route).toBe('manual')
    expect(path.route === 'manual' && path.reason).toBe('no-further-route')
  })

  it('does not count the recreational route as a Part 107 route', () => {
    /* 44809 is the recreational exception. It is not Part 107 and not a shoot. */
    const path = laancPath(cell({ ceilingFeet: 300, routes: ['44809-AA'] }), 200)
    expect(path.route).toBe('manual')
    expect(path.route === 'manual' && path.reason).toBe('no-auto-route')
  })

  it('is the real shape of the shipped extract, not a hypothetical', async () => {
    const { facilityCellAt } = await import('../lib/uasfm.ts')
    /* San Juan: ceiling 150, and no Part 107 route listed. */
    const sanJuan = facilityCellAt(18.4125, -66.0792)
    expect(sanJuan?.ceilingFeet).toBe(150)
    const path = laancPath(sanJuan, 100)
    expect(path.route).toBe('manual')
    expect(path.route === 'manual' && path.reason).toBe('no-auto-route')
  })
})

describe('what it says about the airspace', () => {
  it('reports the classes the cell carries', () => {
    expect(surfaceClasses(cell({ classes: ['C', 'D'] }))).toEqual(['C', 'D'])
  })

  /*
   * An empty list is an absence of data. The app does not turn it into a
   * statement that the airspace is uncontrolled, for the same reason it does
   * not say an area is clear of hazards.
   */
  it('reports no classes outside coverage, rather than claiming none apply', () => {
    expect(surfaceClasses(null)).toEqual([])
  })
})

describe('the wording', () => {
  const ALL: LaancPath[] = [
    laancPath(cell({ ceilingFeet: 200 }), 150),
    laancPath(cell({ ceilingFeet: 100 }), 200),
    laancPath(cell({ ceilingFeet: 0 }), 200),
    laancPath(cell({ ceilingFeet: 150, routes: [] }), 100),
    laancPath(cell({ ceilingFeet: 100, routes: ['107-AA'] }), 300),
    laancPath(null, 200),
  ]

  it('states the ceiling and the altitude it compared', () => {
    const why = laancWhy(laancPath(cell({ ceilingFeet: 200 }), 150))
    expect(why).toContain('200 ft AGL')
    expect(why).toContain('150 ft')
  })

  it('says plainly that outside coverage is missing data, not a free sky', () => {
    const why = laancWhy(laancPath(null, 200))
    expect(why).toContain('no facility-map cell')
    expect(why).toContain('absence of data')
  })

  it('names the timing of every route without guaranteeing it', () => {
    expect(ROUTE_TIMING['auto-approval']).toContain('minutes')
    expect(ROUTE_TIMING['further-coordination']).toContain('90 days')
    expect(ROUTE_TIMING.manual).toContain('DroneZone')
    expect(ROUTE_LABEL['auto-approval']).toBe('LAANC auto-approval')
  })

  /*
   * Same rule as the Part 107 altitude card. The FAA's own process NAMES are
   * allowed here, because "the auto-approval route" describes a process and
   * "this flight is approved" is a verdict. The banned list is verdicts.
   */
  const BANNED = [
    'cleared',
    'compliant',
    'compliance',
    'legal',
    'illegal',
    'lawful',
    'unlawful',
    'permitted',
    'you may fly',
    'safe to fly',
    'ok to fly',
    'allowed to fly',
    'you can fly',
    'no restrictions',
    'free to fly',
    'clear of',
    'is approved',
    'are approved',
    'good to go',
    'violation',
  ]

  it('states no verdict on any route', () => {
    for (const path of ALL) {
      const shown = [laancWhy(path), ROUTE_TIMING[path.route], ROUTE_LABEL[path.route]]
        .join(' ')
        .toLowerCase()
      for (const phrase of BANNED) {
        expect(shown, `${path.route} wording contains "${phrase}"`).not.toContain(phrase)
      }
    }
  })

  it('would catch a verdict if one were written', () => {
    const bad = 'This flight is approved and compliant, you may fly.'.toLowerCase()
    expect(BANNED.some((p) => bad.includes(p))).toBe(true)
  })
})

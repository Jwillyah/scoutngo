import { describe, expect, it } from 'vitest'
import { bearingBetween, destinationPoint, distanceMeters, type LatLon } from './geo.ts'
import {
  ARRIVED_METERS,
  awayLabel,
  compassPoint,
  lightingChange,
  TOO_FAR_TO_WALK_METERS,
  walkTo,
} from './field.ts'

const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }

describe('compassPoint', () => {
  it('names the cardinals', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(270)).toBe('W')
  })

  it('names the sixteenths', () => {
    expect(compassPoint(45)).toBe('NE')
    expect(compassPoint(135)).toBe('SE')
    expect(compassPoint(22.5)).toBe('NNE')
  })

  it('wraps rather than falling off the end', () => {
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(359)).toBe('N')
    expect(compassPoint(-90)).toBe('W')
  })

  /* The N/NNE boundary sits at 11.25 degrees, half of a 22.5 degree sector. */
  it('rounds to the nearest point, not down', () => {
    expect(compassPoint(11.2)).toBe('N')
    expect(compassPoint(11.3)).toBe('NNE')
  })
})

describe('walkTo', () => {
  /*
   * Composition, not reimplementation. If these ever disagree with geo.ts then
   * FIELD is navigating by different arithmetic from the one the cones are drawn
   * with, which is the exact class of bug this project exists to avoid.
   */
  it('agrees with the geo core it composes', () => {
    const target = destinationPoint(VENUE, 137, 250)
    const walk = walkTo(VENUE, target)
    expect(walk.bearing).toBeCloseTo(bearingBetween(VENUE, target), 6)
    expect(walk.meters).toBeCloseTo(distanceMeters(VENUE, target), 6)
  })

  it('reports the direction as a bearing and a compass point', () => {
    const walk = walkTo(VENUE, destinationPoint(VENUE, 137, 250))
    expect(walk.bearing).toBeCloseTo(137, 0)
    expect(walk.compass).toBe('SE')
  })

  it('carries both units, because the kit is metric and the airspace is not', () => {
    const walk = walkTo(VENUE, destinationPoint(VENUE, 90, 100))
    expect(walk.meters).toBeCloseTo(100, 0)
    expect(walk.feet).toBeCloseTo(328, 0)
  })

  /*
   * A phone is good to about five metres on a clear day and much worse beside a
   * building. Pointing someone at a bearing from three metres away is pointing
   * them at noise.
   */
  it('calls it arrived rather than giving a bearing from inside the noise', () => {
    expect(walkTo(VENUE, destinationPoint(VENUE, 90, 3)).arrived).toBe(true)
    expect(walkTo(VENUE, destinationPoint(VENUE, 90, ARRIVED_METERS - 1)).arrived).toBe(true)
    expect(walkTo(VENUE, destinationPoint(VENUE, 90, 40)).arrived).toBe(false)
  })

  it('is arrived when you are standing on it', () => {
    expect(walkTo(VENUE, VENUE).arrived).toBe(true)
  })
})

describe('lightingChange', () => {
  /*
   * A plan is made at one moment and shot at another. Between the two the sun
   * keeps going, and a position chosen as front-lit can be side-lit by the time
   * anyone stands on it.
   */
  it('reports a class that has moved since the plan', () => {
    expect(lightingChange('front-lit', 'side-lit')).toEqual({
      planned: 'front-lit',
      now: 'side-lit',
    })
  })

  it('stays quiet when nothing has changed', () => {
    expect(lightingChange('front-lit', 'front-lit')).toBeNull()
    expect(lightingChange('backlit', 'backlit')).toBeNull()
  })

  it('catches the worst case, front-lit gone backlit', () => {
    expect(lightingChange('front-lit', 'backlit')).not.toBeNull()
  })
})

/*
 * A BEARING IS WALKING ADVICE. Opening Field at home showed "9011m" and a
 * compass point: true, and useless. It is a straight line across a county,
 * through buildings and a river, and nobody is walking it.
 */
describe('too far to walk', () => {
  const HERE: LatLon = { lat: 38.364236, lon: -75.605912 }
  const far = (meters: number) => destinationPoint(HERE, 90, meters)

  it('walks normally inside the threshold', () => {
    const walk = walkTo(HERE, far(400))
    expect(walk.farAway).toBe(false)
    expect(walk.arrived).toBe(false)
    expect(walk.compass).not.toBe('')
  })

  it('stops calling it a walk past two kilometres', () => {
    expect(walkTo(HERE, far(TOO_FAR_TO_WALK_METERS + 1)).farAway).toBe(true)
    expect(walkTo(HERE, far(9011)).farAway).toBe(true)
  })

  it('holds the boundary itself as still walkable', () => {
    expect(walkTo(HERE, far(TOO_FAR_TO_WALK_METERS)).farAway).toBe(false)
  })

  /* Arrived and far away are different answers and must never both be true. */
  it('is never both arrived and far away', () => {
    for (const d of [0, 5, 10, 11, 1999, 2000, 2001, 50_000]) {
      const walk = walkTo(HERE, far(d))
      expect(walk.arrived && walk.farAway).toBe(false)
    }
  })
})

describe('awayLabel', () => {
  /* Coarse on purpose: 9043 m implies a fix this app does not have. */
  it('rounds metres to ten and kilometres to one place', () => {
    expect(awayLabel(9011)).toBe('9.0 km')
    expect(awayLabel(2400)).toBe('2.4 km')
    expect(awayLabel(844)).toBe('840 m')
    expect(awayLabel(7)).toBe('10 m')
  })

  it('switches unit at a kilometre', () => {
    expect(awayLabel(999)).toBe('1000 m')
    expect(awayLabel(1000)).toBe('1.0 km')
  })

  it('says it does not know rather than printing nonsense', () => {
    expect(awayLabel(Number.NaN)).toBe('an unknown distance')
    expect(awayLabel(-5)).toBe('an unknown distance')
  })
})

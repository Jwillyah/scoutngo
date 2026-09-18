import { describe, expect, it } from 'vitest'
import { bearingBetween, destinationPoint, distanceMeters, type LatLon } from './geo.ts'
import { ARRIVED_METERS, compassPoint, lightingChange, walkTo } from './field.ts'

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

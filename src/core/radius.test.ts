import { describe, expect, it } from 'vitest'
import { destinationPoint, type LatLon } from './geo.ts'
import {
  clampRadius,
  isWithinRadius,
  metersBeyondRadius,
  RADIUS_DEFAULT_METERS,
  RADIUS_MAX_METERS,
  RADIUS_MIN_METERS,
} from './radius.ts'

const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }
const away = (metres: number, bearing = 90) => destinationPoint(VENUE, bearing, metres)

describe('clampRadius', () => {
  it('holds the ring inside the band it can be dragged through', () => {
    expect(clampRadius(400)).toBe(400)
    expect(clampRadius(1)).toBe(RADIUS_MIN_METERS)
    expect(clampRadius(99_999)).toBe(RADIUS_MAX_METERS)
  })

  /* A ring of zero would reject every position, including the good ones. */
  it('never returns zero', () => {
    expect(clampRadius(0)).toBeGreaterThan(0)
    expect(clampRadius(-100)).toBeGreaterThan(0)
  })

  /*
   * Infinity is treated like NaN rather than as "as far as possible": neither is
   * a measurement, and falling back to the default is the answer that cannot be
   * wrong by a mile.
   */
  it('falls back to the default on anything that is not a measurement', () => {
    expect(clampRadius(Number.NaN)).toBe(RADIUS_DEFAULT_METERS)
    expect(clampRadius(Number.POSITIVE_INFINITY)).toBe(RADIUS_DEFAULT_METERS)
  })

  it('rounds to whole metres, because the ring is dragged by thumb', () => {
    expect(clampRadius(412.7)).toBe(413)
  })
})

describe('isWithinRadius', () => {
  it('accepts a position inside the ring', () => {
    expect(isWithinRadius(VENUE, away(200), 400)).toBe(true)
  })

  it('rejects one outside it', () => {
    expect(isWithinRadius(VENUE, away(600), 400)).toBe(false)
  })

  /*
   * INCLUSIVE ON PURPOSE, and it needs a tolerance to be so: the geodesic
   * forward and inverse differ by about a nanometre, which without slack makes a
   * position placed exactly on the ring read as outside it.
   */
  it('accepts a position sitting on the ring', () => {
    expect(isWithinRadius(VENUE, away(400), 400)).toBe(true)
    expect(isWithinRadius(VENUE, away(400.005), 400)).toBe(true)
  })

  it('still rejects a position genuinely past the edge', () => {
    expect(isWithinRadius(VENUE, away(401), 400)).toBe(false)
  })

  it('accepts the venue itself', () => {
    expect(isWithinRadius(VENUE, VENUE, 400)).toBe(true)
  })

  it('does not care which direction the position lies in', () => {
    for (const bearing of [0, 90, 180, 270]) {
      expect(isWithinRadius(VENUE, away(300, bearing), 400)).toBe(true)
      expect(isWithinRadius(VENUE, away(500, bearing), 400)).toBe(false)
    }
  })
})

describe('metersBeyondRadius', () => {
  it('reports how far outside a position sits, so the card can say', () => {
    expect(metersBeyondRadius(VENUE, away(600), 400)).toBeCloseTo(200, 0)
  })

  it('is zero inside the ring rather than negative', () => {
    expect(metersBeyondRadius(VENUE, away(100), 400)).toBe(0)
    expect(metersBeyondRadius(VENUE, VENUE, 400)).toBe(0)
  })
})

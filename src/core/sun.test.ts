import { describe, expect, it } from 'vitest'
import { getSunPosition, normalizeBearing, toCompassAzimuth } from './sun.ts'

describe('toCompassAzimuth', () => {
  it('maps suncalc 0 (due south) to 180 compass', () => {
    expect(toCompassAzimuth(0)).toBeCloseTo(180, 10)
  })

  it('maps +90 degrees toward west to 270 compass', () => {
    expect(toCompassAzimuth(Math.PI / 2)).toBeCloseTo(270, 10)
  })

  it('maps -90 degrees toward east to 90 compass', () => {
    expect(toCompassAzimuth(-Math.PI / 2)).toBeCloseTo(90, 10)
  })

  it('always returns a value in [0, 360)', () => {
    for (const r of [-Math.PI, Math.PI, -3 * Math.PI, 4 * Math.PI]) {
      const a = toCompassAzimuth(r)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(360)
    }
  })
})

describe('normalizeBearing', () => {
  it('wraps negatives and overflow into [0, 360)', () => {
    expect(normalizeBearing(-10)).toBeCloseTo(350, 10)
    expect(normalizeBearing(370)).toBeCloseTo(10, 10)
    expect(normalizeBearing(360)).toBeCloseTo(0, 10)
  })
})

describe('getSunPosition', () => {
  // Sanity check demanded by the brief: northern hemisphere solar noon is due south.
  it('puts the sun near due south at midday in the northern hemisphere', () => {
    const { azimuth, altitude } = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), 38.3648, -75.6069)
    expect(azimuth).toBeGreaterThan(160)
    expect(azimuth).toBeLessThan(210)
    expect(altitude).toBeGreaterThan(0)
  })

  it('puts the sun near due north at midday in the southern hemisphere', () => {
    // Sydney, local solar noon in January.
    const { azimuth } = getSunPosition(new Date('2026-01-15T12:50:00+11:00'), -33.8688, 151.2093)
    const offFromNorth = Math.min(azimuth, 360 - azimuth)
    expect(offFromNorth).toBeLessThan(30)
  })

  it('reports a negative altitude at local midnight', () => {
    const { altitude } = getSunPosition(new Date('2026-09-12T00:00:00-04:00'), 38.3648, -75.6069)
    expect(altitude).toBeLessThan(0)
  })

  it('derives shadowBearing as the reciprocal of the azimuth', () => {
    const { azimuth, shadowBearing } = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), 38.3648, -75.6069)
    expect(shadowBearing).toBeCloseTo(normalizeBearing(azimuth + 180), 10)
  })
})

import { describe, expect, it } from 'vitest'
import { getSunArc, getSunPosition, normalizeBearing, toCompassAzimuth } from './sun.ts'

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

describe('getSunArc', () => {
  const LAT = 38.364236
  const LON = -75.605912
  const DAY = new Date('2026-09-12T13:00:00-04:00')

  it('puts sunrise in the east and sunset in the west', () => {
    const arc = getSunArc(DAY, LAT, LON)
    expect(arc.sunrise).not.toBeNull()
    expect(arc.sunset).not.toBeNull()
    // Mid September, close to the equinox, so both sit near due east and west.
    expect(arc.sunrise!.azimuth).toBeGreaterThan(60)
    expect(arc.sunrise!.azimuth).toBeLessThan(110)
    expect(arc.sunset!.azimuth).toBeGreaterThan(250)
    expect(arc.sunset!.azimuth).toBeLessThan(300)
  })

  it('agrees with getSunPosition at those exact times', () => {
    // The arc must not be a second source of solar truth.
    const arc = getSunArc(DAY, LAT, LON)
    expect(arc.sunrise!.azimuth).toBeCloseTo(
      getSunPosition(arc.sunrise!.at, LAT, LON).azimuth,
      10,
    )
  })

  it('reports sunrise before sunset', () => {
    const arc = getSunArc(DAY, LAT, LON)
    expect(arc.sunrise!.at.getTime()).toBeLessThan(arc.sunset!.at.getTime())
  })

  it('returns nulls during polar night instead of throwing', () => {
    // Longyearbyen in December: the sun does not rise.
    const arc = getSunArc(new Date('2026-12-21T12:00:00Z'), 78.22, 15.65)
    expect(arc.sunrise).toBeNull()
    expect(arc.sunset).toBeNull()
  })
})

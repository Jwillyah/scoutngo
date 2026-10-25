import { describe, expect, it } from 'vitest'
import { distanceMeters, type LatLon } from './geo.ts'
import { footprintSize } from './footprint.ts'
import {
  AIR_3S_PHOTO_ASPECT,
  droneFootprint,
  FOOTPRINT_MAX_METERS,
  frameAngles,
} from './droneFootprint.ts'

const AT: LatLon = { lat: 36.8466, lon: -75.9767 }
const pt = ([lon, lat]: number[]): LatLon => ({ lat, lon })
const WIDE = frameAngles(24, AIR_3S_PHOTO_ASPECT)

describe('the frame angles', () => {
  /* DJI quote the Air 3S wide camera, 24 mm equivalent, as 84 degrees diagonal. */
  it('reproduces the published 84 degree diagonal at 24 mm', () => {
    expect(WIDE.dFOV).toBeCloseTo(84, 0)
  })

  it('splits the diagonal by the frame shape', () => {
    expect(WIDE.hFOV).toBeGreaterThan(WIDE.vFOV)
    const ratio =
      Math.tan((WIDE.hFOV / 2) * (Math.PI / 180)) / Math.tan((WIDE.vFOV / 2) * (Math.PI / 180))
    expect(ratio).toBeCloseTo(4 / 3, 6)
  })
})

describe('the ground footprint', () => {
  /* Straight down, it must agree with footprint.ts, the nadir case already in core. */
  it('nadir: a centred rectangle 2h tan(hFOV/2) wide', () => {
    const f = droneFootprint({ at: AT, altitudeFeet: 200, tiltDegrees: 90, headingDegrees: 0, hFOV: WIDE.hFOV, vFOV: WIDE.vFOV })
    const [farLeft, farRight, nearRight, nearLeft] = f.ring.map(pt)
    const size = footprintSize(200, WIDE.hFOV, WIDE.vFOV)
    expect(distanceMeters(farLeft, farRight)).toBeCloseTo(size.widthMeters, 0)
    expect(distanceMeters(farRight, nearRight)).toBeCloseTo(size.heightMeters, 0)
    expect(distanceMeters(nearLeft, farLeft)).toBeCloseTo(size.heightMeters, 0)
    const centre = { lat: (farLeft.lat + nearRight.lat) / 2, lon: (farLeft.lon + nearRight.lon) / 2 }
    expect(distanceMeters(centre, AT)).toBeLessThan(0.5)
    expect(f.reachesHorizon).toBe(false)
    expect(f.ring.at(-1)).toEqual(f.ring[0])
  })

  it('tilted, the far edge runs out to height / tan(top ray angle)', () => {
    const f = droneFootprint({ at: AT, altitudeFeet: 200, tiltDegrees: 60, headingDegrees: 0, hFOV: WIDE.hFOV, vFOV: WIDE.vFOV })
    const top = 60 - WIDE.vFOV / 2
    expect(f.farMeters).toBeCloseTo((200 * 0.3048) / Math.tan(top * (Math.PI / 180)), 0)
    expect(f.farMeters).toBeGreaterThan(f.nearMeters)
    expect(f.reachesHorizon).toBe(false)
  })

  it('faces the heading: east at 90 degrees', () => {
    const f = droneFootprint({ at: AT, altitudeFeet: 200, tiltDegrees: 45, headingDegrees: 90, hFOV: WIDE.hFOV, vFOV: WIDE.vFOV })
    const [farLeft, farRight] = f.ring.map(pt)
    expect(farLeft.lon).toBeGreaterThan(AT.lon)
    expect(farRight.lon).toBeGreaterThan(AT.lon)
  })

  /* A top ray at or above the horizon never meets the ground: cut off and said. */
  it('says when the frame reaches the horizon, and cuts it off', () => {
    const f = droneFootprint({ at: AT, altitudeFeet: 200, tiltDegrees: 10, headingDegrees: 0, hFOV: WIDE.hFOV, vFOV: WIDE.vFOV })
    expect(f.reachesHorizon).toBe(true)
    for (const corner of f.ring.slice(0, 2).map(pt)) {
      expect(distanceMeters(AT, corner)).toBeLessThanOrEqual(FOOTPRINT_MAX_METERS + 1)
    }
    expect(f.assumesFlatGround).toBe(true)
  })
})

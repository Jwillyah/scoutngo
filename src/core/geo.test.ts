import { describe, expect, it } from 'vitest'
import {
  axisLine,
  bearingBetween,
  destinationPoint,
  distanceMeters,
  fovConePolygon,
} from './geo.ts'

const BREW_RIVER = { lat: 38.3648, lon: -75.6069 }

describe('bearingBetween', () => {
  it('reads due north, east, south and west as compass degrees', () => {
    expect(bearingBetween(BREW_RIVER, { lat: 38.375, lon: -75.6069 })).toBeCloseTo(0, 1)
    expect(bearingBetween(BREW_RIVER, { lat: 38.3648, lon: -75.595 })).toBeCloseTo(90, 1)
    expect(bearingBetween(BREW_RIVER, { lat: 38.355, lon: -75.6069 })).toBeCloseTo(180, 1)
    expect(bearingBetween(BREW_RIVER, { lat: 38.3648, lon: -75.62 })).toBeCloseTo(270, 1)
  })

  it('never returns a negative bearing', () => {
    // turf gives -90 here. Normalised it must be 270.
    const west = bearingBetween(BREW_RIVER, { lat: 38.3648, lon: -75.62 })
    expect(west).toBeGreaterThanOrEqual(0)
    expect(west).toBeLessThan(360)
  })

  it('is reciprocal within a degree over short distances', () => {
    const other = { lat: 38.3636, lon: -75.6055 }
    const there = bearingBetween(BREW_RIVER, other)
    const back = bearingBetween(other, BREW_RIVER)
    const d = Math.abs(there - back)
    expect(Math.min(d, 360 - d)).toBeCloseTo(180, 0)
  })
})

describe('destinationPoint and distanceMeters', () => {
  it('round trips a bearing and a distance', () => {
    const moved = destinationPoint(BREW_RIVER, 135, 250)
    expect(distanceMeters(BREW_RIVER, moved)).toBeCloseTo(250, 0)
    expect(bearingBetween(BREW_RIVER, moved)).toBeCloseTo(135, 1)
  })

  it('accepts an unnormalised bearing', () => {
    const a = destinationPoint(BREW_RIVER, 400, 100)
    const b = destinationPoint(BREW_RIVER, 40, 100)
    expect(a.lat).toBeCloseTo(b.lat, 9)
    expect(a.lon).toBeCloseTo(b.lon, 9)
  })
})

describe('fovConePolygon', () => {
  it('closes the ring at the camera apex', () => {
    const [ring] = fovConePolygon(BREW_RIVER, 180, 20, 300)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(ring[0]).toEqual([BREW_RIVER.lon, BREW_RIVER.lat])
  })

  it('spans exactly the field of view, half either side of the bearing', () => {
    const fov = 30
    const bearing = 90
    const [ring] = fovConePolygon(BREW_RIVER, bearing, fov, 500, 12)
    // ring[1] is the first arc point, ring[length - 2] the last.
    const first = { lon: ring[1][0], lat: ring[1][1] }
    const last = { lon: ring[ring.length - 2][0], lat: ring[ring.length - 2][1] }
    expect(bearingBetween(BREW_RIVER, first)).toBeCloseTo(bearing - fov / 2, 1)
    expect(bearingBetween(BREW_RIVER, last)).toBeCloseTo(bearing + fov / 2, 1)
  })

  it('holds every arc point at the requested range', () => {
    const [ring] = fovConePolygon(BREW_RIVER, 45, 60, 400, 8)
    for (const [lon, lat] of ring.slice(1, -1)) {
      expect(distanceMeters(BREW_RIVER, { lat, lon })).toBeCloseTo(400, 0)
    }
  })

  it('makes a narrow cone for a long lens and a wide one for a short lens', () => {
    const [tight] = fovConePolygon(BREW_RIVER, 0, 5, 300, 8)
    const [wide] = fovConePolygon(BREW_RIVER, 0, 90, 300, 8)
    const spread = (ring: number[][]) => {
      const a = { lon: ring[1][0], lat: ring[1][1] }
      const b = { lon: ring[ring.length - 2][0], lat: ring[ring.length - 2][1] }
      return distanceMeters(a, b)
    }
    expect(spread(tight)).toBeLessThan(spread(wide))
  })
})

describe('axisLine', () => {
  it('runs through the centre, out both ways along the azimuth', () => {
    const [back, forward] = axisLine(BREW_RIVER, 180, 1000)
    expect(bearingBetween(BREW_RIVER, { lat: forward[1], lon: forward[0] })).toBeCloseTo(180, 1)
    expect(bearingBetween(BREW_RIVER, { lat: back[1], lon: back[0] })).toBeCloseTo(0, 1)
    expect(distanceMeters(BREW_RIVER, { lat: forward[1], lon: forward[0] })).toBeCloseTo(1000, 0)
  })
})

import { describe, expect, it } from 'vitest'
import { bearingBetween, destinationPoint, type LatLon, type Position } from './geo.ts'
import {
  convexHull,
  MAX_SHADOW_METERS,
  pointInShadow,
  shadowMap,
  subjectShadow,
  vertexOffset,
  type FootprintIn,
} from './shadowMap.ts'

const CENTRE: LatLon = { lat: 38.364236, lon: -75.605912 }

/** A square footprint, side in metres, centred on a point. */
function square(centre: LatLon, side: number): Position[] {
  const half = side / 2
  const n = destinationPoint(centre, 0, half).lat
  const s = destinationPoint(centre, 180, half).lat
  const e = destinationPoint(centre, 90, half).lon
  const w = destinationPoint(centre, 270, half).lon
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ]
}

const CUBE: FootprintIn = { id: 'cube', ring: square(CENTRE, 10), heightMeters: 10 }

describe('a 10 m cube', () => {
  it('at 45 degrees casts a 10 m shadow straight away from the sun', () => {
    const map = shadowMap([CUBE], { azimuth: 135, altitude: 45 })
    expect(map.status).toBe('ok')
    if (map.status !== 'ok') return
    const shadow = map.shadows[0]
    expect(shadow.lengthMeters).toBeCloseTo(10, 6)
    expect(shadow.bearing).toBe(315)
    /* The translated footprint is part 1; each vertex moved 10 m on 315. */
    const [footprint, moved] = shadow.parts
    for (let i = 0; i < 4; i++) {
      expect(vertexOffset(footprint[i], moved[i])).toBeCloseTo(10, 3)
      const b = bearingBetween({ lon: footprint[i][0], lat: footprint[i][1] }, { lon: moved[i][0], lat: moved[i][1] })
      expect(Math.abs(((b - 315 + 540) % 360) - 180)).toBeLessThan(0.01)
    }
  })

  it('with the sun overhead casts no length', () => {
    const map = shadowMap([CUBE], { azimuth: 180, altitude: 90 })
    expect(map.status === 'ok' && map.shadows[0].lengthMeters).toBeCloseTo(0, 6)
  })

  it('with the sun down casts nothing, and says why', () => {
    const map = shadowMap([CUBE], { azimuth: 270, altitude: -3 })
    expect(map.status).toBe('no-sun')
    if (map.status !== 'no-sun') return
    expect(map.reason).toMatch(/sun is down/)
  })

  it('caps a shadow at a very low sun, and says it did', () => {
    const map = shadowMap([CUBE], { azimuth: 270, altitude: 0.2 })
    expect(map.status === 'ok' && map.shadows[0].lengthMeters).toBe(MAX_SHADOW_METERS)
    expect(map.status === 'ok' && map.anyCapped).toBe(true)
  })
})

describe('noon, sun due south at 30 degrees', () => {
  const map = shadowMap([CUBE], { azimuth: 180, altitude: 30 })
  /* 10 / tan 30 = 17.3 m of shadow, pointing north. */
  it('shades a point just north of the building', () => {
    expect(pointInShadow(destinationPoint(CENTRE, 0, 12), map)).toBe('cube')
  })

  it('leaves a point just south of it unshaded', () => {
    expect(pointInShadow(destinationPoint(CENTRE, 180, 12), map)).toBeNull()
  })

  it('stops where the shadow stops', () => {
    expect(pointInShadow(destinationPoint(CENTRE, 0, 5 + 17), map)).toBe('cube')
    expect(pointInShadow(destinationPoint(CENTRE, 0, 5 + 19), map)).toBeNull()
  })
})

describe('buildings with no known height', () => {
  it('cast nothing, and are counted', () => {
    const unknown: FootprintIn = { id: 'u', ring: square(destinationPoint(CENTRE, 90, 50), 10), heightMeters: null }
    const map = shadowMap([CUBE, unknown], { azimuth: 180, altitude: 30 })
    expect(map.status === 'ok' && map.shadows.map((s) => s.id)).toEqual(['cube'])
    expect(map.skippedNoHeight).toBe(1)
    /* North of the unknown building is not claimed as shade. */
    expect(pointInShadow(destinationPoint(destinationPoint(CENTRE, 90, 50), 0, 10), map)).toBeNull()
  })
})

describe('a concave footprint', () => {
  /* An L: the swept parts are exact, the hull over-covers the inside corner. */
  const a = destinationPoint(CENTRE, 225, 20)
  const L = (de: number, dn: number): Position => {
    const p = destinationPoint(destinationPoint(a, 90, de), 0, dn)
    return [p.lon, p.lat]
  }
  const ring = [L(0, 0), L(30, 0), L(30, 10), L(10, 10), L(10, 30), L(0, 30), L(0, 0)]

  it('flags its drawing hull as larger than the shadow', () => {
    const map = shadowMap([{ id: 'L', ring, heightMeters: 3 }], { azimuth: 0, altitude: 60 })
    expect(map.status === 'ok' && map.shadows[0].hullExact).toBe(false)
  })

  it('does not shade the inside corner with the sun overhead-ish', () => {
    const map = shadowMap([{ id: 'L', ring, heightMeters: 3 }], { azimuth: 0, altitude: 80 })
    const corner = destinationPoint(destinationPoint(a, 90, 20), 0, 20)
    expect(pointInShadow(corner, map)).toBeNull()
  })

  it('a square is convex', () => {
    const map = shadowMap([CUBE], { azimuth: 0, altitude: 60 })
    expect(map.status === 'ok' && map.shadows[0].hullExact).toBe(true)
  })
})

describe('a subject', () => {
  it('throws height / tan(altitude), away from the sun', () => {
    const s = subjectShadow(1.8, 0.5, { azimuth: 250, altitude: 20 })
    expect(s?.lengthMeters).toBeCloseTo(1.8 / Math.tan((20 * Math.PI) / 180), 6)
    expect(s?.bearing).toBe(70)
    expect(s?.widthMeters).toBe(0.5)
  })

  it('throws nothing with the sun down', () => {
    expect(subjectShadow(1.8, 0.5, { azimuth: 250, altitude: -1 })).toBeNull()
  })
})

describe('the hull', () => {
  it('drops interior points', () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 1],
    ])
    expect(hull).toHaveLength(4)
  })
})

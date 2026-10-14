import { describe, expect, it } from 'vitest'
import {
  axisLine,
  bearingBetween,
  bearingLineEnd,
  destinationPoint,
  distanceMeters,
  fovConePolygon,
  MERCATOR_MAX_LAT,
  rhumbPoint,
  type LatLon,
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

/*
 * A bearing line is drawn as a two point segment, which the map renders
 * straight in projected space. These two assertions are what make that
 * drawing correct: the bearing does not drift, and the straight segment is
 * the line itself rather than a chord across a curve.
 */
describe('rhumbPoint holds a constant compass bearing', () => {
  const MERCATOR_Y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

  /** Compass bearing to a point, read off the projection the map draws in. */
  const mercatorBearing = (to: LatLon) => {
    const dy = MERCATOR_Y(to.lat) - MERCATOR_Y(BREW_RIVER.lat)
    const dx = ((to.lon - BREW_RIVER.lon) * Math.PI) / 180
    return (((Math.atan2(dx, dy) * 180) / Math.PI) + 360) % 360
  }

  it('holds the bearing the whole way, where a great circle does not', () => {
    const far = rhumbPoint(BREW_RIVER, 45, 200_000)
    expect(mercatorBearing(far)).toBeCloseTo(45, 6)
    /*
     * And the two really do differ, which is the reason this function exists.
     * bearingBetween is the great circle's INITIAL bearing, so over 200km it
     * reads half a degree off the constant bearing actually travelled. Going
     * the other way, a great circle endpoint read as a compass direction is
     * wrong by the same amount, which is the skew this replaced.
     */
    expect(Math.abs(bearingBetween(BREW_RIVER, far) - 45)).toBeGreaterThan(0.4)
    expect(Math.abs(mercatorBearing(destinationPoint(BREW_RIVER, 45, 200_000)) - 45)).toBeGreaterThan(0.4)
  })

  it('is straight in Mercator, so the drawn segment is the line', () => {
    const bearing = 30
    const near = rhumbPoint(BREW_RIVER, bearing, 20_000)
    const far = rhumbPoint(BREW_RIVER, bearing, 80_000)
    // Equal slope in projected space from the origin to each point.
    const slope = (p: { lat: number; lon: number }) =>
      (p.lon - BREW_RIVER.lon) / (MERCATOR_Y(p.lat) - MERCATOR_Y(BREW_RIVER.lat))
    expect(slope(near)).toBeCloseTo(slope(far), 6)
  })

  it('travels the distance asked for', () => {
    // Along a meridian a rhumb and a great circle are the same line.
    expect(distanceMeters(BREW_RIVER, rhumbPoint(BREW_RIVER, 0, 5000))).toBeCloseTo(5000, 0)
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

/*
 * A bearing line is as long as the viewport is wide, which at a wide zoom is
 * over a degree of latitude, so these are reachable rather than theoretical.
 */
describe('bearingLineEnd keeps a long bearing line on the map', () => {
  it('leaves an ordinary line exactly where the rhumb puts it', () => {
    const plain = rhumbPoint(BREW_RIVER, 37, 60_000)
    expect(bearingLineEnd(BREW_RIVER, 37, 60_000)).toEqual(plain)
  })

  /* The hazard being guarded against, stated on the unguarded function. */
  it('is guarding against a rhumb that runs over the pole and reverses', () => {
    const past = rhumbPoint({ lat: 89.9, lon: 15.3 }, 0, 131_000)
    expect(past.lat).toBeLessThan(89.9)
    expect(past.lon).toBeCloseTo(15.3, 6)
  })

  it('stops at the edge of the projection going north', () => {
    // Svalbard, 78.2N, is a real place to shoot and well inside the limit.
    const origin = { lat: 84.8, lon: 15.3 }
    const end = bearingLineEnd(origin, 0, 200_000)
    expect(end.lat).toBeCloseTo(MERCATOR_MAX_LAT, 4)
    expect(end.lat).toBeGreaterThan(origin.lat)
    // Due north, so the line has not been bent sideways to get there.
    expect(end.lon).toBeCloseTo(origin.lon, 6)
  })

  it('stops at the edge of the projection going south', () => {
    const end = bearingLineEnd({ lat: -84.8, lon: 15.3 }, 180, 200_000)
    expect(end.lat).toBeCloseTo(-MERCATOR_MAX_LAT, 4)
  })

  it('clamps on the northward component, not only on due north', () => {
    const end = bearingLineEnd({ lat: 84.9, lon: 15.3 }, 30, 400_000)
    expect(end.lat).toBeCloseTo(MERCATOR_MAX_LAT, 4)
    // Still on the 30 degree rhumb, so it has moved east as well as north.
    expect(end.lon).toBeGreaterThan(15.3)
  })

  it('does not clamp a line running due east, which never changes latitude', () => {
    const end = bearingLineEnd({ lat: 84.9, lon: 15.3 }, 90, 400_000)
    expect(end.lat).toBeCloseTo(84.9, 6)
  })

  /*
   * An origin already outside the projection has no line on the map at all,
   * so it gets a zero length one rather than a wrong one.
   */
  it('draws nothing from an origin the projection cannot show', () => {
    const origin = { lat: 89.9, lon: 15.3 }
    expect(bearingLineEnd(origin, 0, 131_000)).toEqual(
      expect.objectContaining({ lon: expect.closeTo(15.3, 6) }),
    )
    expect(bearingLineEnd(origin, 0, 131_000).lat).toBeCloseTo(89.9, 6)
  })
})

/*
 * THE OTHER LIMIT ON A LONG BEARING LINE.
 *
 * Latitude is the obvious one. Longitude is not: a rhumb due east at latitude
 * 25 has a circumference of about 36,300km, so a line longer than that goes
 * round and comes back, and rhumbDestination hands back a longitude already
 * wrapped into -180..180 so the endpoint looks like a short hop. Measured on
 * the world view before the cap, a 33,554km line due east finished 125px from
 * where it started.
 */
describe('bearingLineEnd does not let a line run round the world', () => {
  /** How far east or west the line actually went, unwrapped. */
  const swing = (origin: LatLon, bearing: number, meters: number) => {
    const end = bearingLineEnd(origin, bearing, meters)
    let d = end.lon - origin.lon
    while (d > 180) d -= 360
    while (d < -180) d += 360
    return d
  }

  it('caps a line that would go more than half way round', () => {
    const origin = { lat: 25, lon: -30 }
    // A full circumference at this latitude is about 36,300km.
    expect(Math.abs(swing(origin, 90, 33_554_432))).toBeCloseTo(180, 4)
    expect(Math.abs(swing(origin, 270, 33_554_432))).toBeCloseTo(180, 4)
  })

  it('leaves a line that does not reach the cap alone', () => {
    const origin = { lat: 25, lon: -30 }
    expect(bearingLineEnd(origin, 90, 50_000)).toEqual(rhumbPoint(origin, 90, 50_000))
  })

  /*
   * Across latitudes and bearings, because the swing per metre depends on the
   * latitudes the line passes through, which is why the cap iterates.
   */
  it('never swings past half a turn, at any latitude or bearing', () => {
    for (const lat of [-80, -60, -25, 0, 12, 40, 61, 84]) {
      for (let bearing = 0; bearing < 360; bearing += 7) {
        for (const meters of [1e5, 1e6, 1e7, 4e7, 2e8]) {
          const s = swing({ lat, lon: 0 }, bearing, meters)
          expect(Math.abs(s), `lat ${lat} bearing ${bearing} ${meters}m`).toBeLessThanOrEqual(
            180.0001,
          )
        }
      }
    }
  })

  it('still respects the latitude limit while capping longitude', () => {
    for (const lat of [-84, -40, 0, 40, 84]) {
      for (let bearing = 0; bearing < 360; bearing += 11) {
        const end = bearingLineEnd({ lat, lon: 0 }, bearing, 2e8)
        expect(Math.abs(end.lat)).toBeLessThanOrEqual(MERCATOR_MAX_LAT + 1e-6)
      }
    }
  })
})

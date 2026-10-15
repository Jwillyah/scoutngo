import { describe, expect, it } from 'vitest'
import { computeFOV, frameWidthMeters, SENSORS } from './fov.ts'
import { bearingBetween, distanceMeters, type LatLon, type Position } from './geo.ts'
import { feetToMeters } from './reachScale.ts'
import {
  footprintSize,
  groundFootprint,
  horizonDistanceMeters,
  horizonRing,
  shadowAcrossFootprint,
  sunTickOnRing,
} from './footprint.ts'

const CENTRE: LatLon = { lat: 38.364236, lon: -75.605912 }
const WIDE = computeFOV(24, SENSORS.fullFrame)
const at = (p: Position): LatLon => ({ lat: p[1], lon: p[0] })

describe('how much ground a nadir frame covers', () => {
  /*
   * The SAME arithmetic as fov.ts with the altitude as the range, because
   * straight down the range is the altitude. If these ever disagree, one of
   * them is computing a frame width a different way.
   */
  it('agrees with frameWidthMeters at the altitude', () => {
    const size = footprintSize(200, WIDE.hFOV, WIDE.vFOV)
    expect(size.widthMeters).toBeCloseTo(frameWidthMeters(feetToMeters(200), WIDE.hFOV), 6)
    expect(size.heightMeters).toBeCloseTo(frameWidthMeters(feetToMeters(200), WIDE.vFOV), 6)
  })

  it('is 91 by 61 metres for the Air 3S wide camera at 200 feet', () => {
    const size = footprintSize(200, WIDE.hFOV, WIDE.vFOV)
    expect(size.widthMeters).toBeCloseTo(91.2, 1)
    expect(size.heightMeters).toBeCloseTo(60.96, 1)
  })

  it('scales linearly with altitude', () => {
    const low = footprintSize(100, WIDE.hFOV, WIDE.vFOV)
    const high = footprintSize(400, WIDE.hFOV, WIDE.vFOV)
    expect(high.widthMeters / low.widthMeters).toBeCloseTo(4, 6)
  })

  it('is wider than it is tall, as the sensor is', () => {
    const size = footprintSize(200, WIDE.hFOV, WIDE.vFOV)
    expect(size.widthMeters).toBeGreaterThan(size.heightMeters)
    expect(size.diagonalMeters).toBeGreaterThan(size.widthMeters)
  })

  /* The altitude is clamped in core, so the footprint cannot be unbounded. */
  it('clamps an absurd altitude the way the field does', () => {
    expect(footprintSize(5000, WIDE.hFOV, WIDE.vFOV)).toEqual(
      footprintSize(400, WIDE.hFOV, WIDE.vFOV),
    )
  })
})

describe('the footprint rectangle', () => {
  const ring = groundFootprint(CENTRE, 200, WIDE.hFOV, WIDE.vFOV, 0)[0]

  it('is a closed ring of four corners', () => {
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
  })

  it('is centred on the point the camera is above', () => {
    // Opposite corners are equidistant from the centre.
    const d = ring.slice(0, 4).map((p) => distanceMeters(CENTRE, at(p)))
    for (const distance of d) expect(distance).toBeCloseTo(d[0], 1)
  })

  it('has the right side lengths', () => {
    const size = footprintSize(200, WIDE.hFOV, WIDE.vFOV)
    const top = distanceMeters(at(ring[0]), at(ring[1]))
    const side = distanceMeters(at(ring[1]), at(ring[2]))
    expect(top).toBeCloseTo(size.widthMeters, 0)
    expect(side).toBeCloseTo(size.heightMeters, 0)
  })

  /*
   * THE YAW TURNS THE RECTANGLE AND NOTHING ELSE. It is not a camera bearing:
   * every corner stays the same distance from the centre, so the frame rotates
   * rather than moving.
   */
  it('turns the rectangle without moving it', () => {
    const turned = groundFootprint(CENTRE, 200, WIDE.hFOV, WIDE.vFOV, 37)[0]
    const before = distanceMeters(CENTRE, at(ring[0]))
    const after = distanceMeters(CENTRE, at(turned[0]))
    expect(after).toBeCloseTo(before, 1)
    // And the corner really did move AROUND the centre, by the yaw.
    const turn =
      bearingBetween(CENTRE, at(turned[0])) - bearingBetween(CENTRE, at(ring[0]))
    expect(((turn % 360) + 360) % 360).toBeCloseTo(37, 0)
  })

  it('comes back to itself after a full turn', () => {
    const full = groundFootprint(CENTRE, 200, WIDE.hFOV, WIDE.vFOV, 360)[0]
    for (let i = 0; i < 5; i++) {
      expect(full[i][0]).toBeCloseTo(ring[i][0], 9)
      expect(full[i][1]).toBeCloseTo(ring[i][1], 9)
    }
  })

  it('is empty when there is no field of view to draw', () => {
    expect(groundFootprint(CENTRE, 200, 0, 0, 0)).toEqual([])
  })
})

/*
 * THE HORIZON, AT TRUE SCALE. The ring in a little planet IS this circle, and
 * drawing it at a convenient radius would be a picture of a different number.
 */
describe('how far the horizon is', () => {
  it('is about 27.9km at 200 feet and 39.4km at 400', () => {
    expect(horizonDistanceMeters(200) / 1000).toBeCloseTo(27.9, 1)
    expect(horizonDistanceMeters(400) / 1000).toBeCloseTo(39.4, 1)
  })

  it('grows with the square root of the altitude', () => {
    // Four times the height is twice the distance.
    const ratio = horizonDistanceMeters(400) / horizonDistanceMeters(100)
    expect(ratio).toBeCloseTo(2, 1)
  })

  it('is clamped with the altitude', () => {
    expect(horizonDistanceMeters(5000)).toBeCloseTo(horizonDistanceMeters(400), 6)
  })
})

describe('the horizon ring', () => {
  const RADIUS = horizonDistanceMeters(200)
  const ring = horizonRing(CENTRE, RADIUS, 36)

  it('is a closed line', () => {
    expect(ring).toHaveLength(37)
    expect(ring[0]).toEqual(ring[36])
  })

  it('is every point at that one distance', () => {
    for (const point of ring) {
      expect(distanceMeters(CENTRE, at(point))).toBeCloseTo(RADIUS, 0)
    }
  })

  it('covers the whole compass', () => {
    const bearings = ring.slice(0, 36).map((p) => bearingBetween(CENTRE, at(p)))
    expect(Math.min(...bearings)).toBeLessThan(10)
    // 36 steps puts the last point on 350, which turf reports as 349.9999.
    expect(Math.max(...bearings)).toBeGreaterThan(349)
  })

  it('is empty rather than degenerate', () => {
    expect(horizonRing(CENTRE, 0)).toEqual([])
    expect(horizonRing(CENTRE, 1000, 2)).toEqual([])
  })
})

describe('the sun tick on the ring', () => {
  const RADIUS = horizonDistanceMeters(200)

  it('sits on the sun bearing, straddling the ring', () => {
    const tick = sunTickOnRing(CENTRE, 118, RADIUS)
    expect(tick).toHaveLength(2)
    for (const point of tick) {
      expect(bearingBetween(CENTRE, at(point))).toBeCloseTo(118, 3)
    }
    const inner = distanceMeters(CENTRE, at(tick[0]))
    const outer = distanceMeters(CENTRE, at(tick[1]))
    expect(inner).toBeLessThan(RADIUS)
    expect(outer).toBeGreaterThan(RADIUS)
  })

  /*
   * Radial, within the convergence of the meridians: the tick spans about
   * 3.3km at a 27.9km radius, and a great circle bearing taken from its inner
   * end to its outer end is a fifth of a degree off due west. The same effect
   * documented on aim.cameraBearing in src/core/shotType.ts.
   */
  it('marks a direction, not a place: it is radial', () => {
    const tick = sunTickOnRing(CENTRE, 270, RADIUS)
    expect(bearingBetween(at(tick[0]), at(tick[1]))).toBeCloseTo(270, 0)
  })
})

/*
 * THE SHADOWS ACROSS THE FRAME, which is the reason the yaw is adjustable.
 */
describe('the shadow line across a footprint', () => {
  const size = footprintSize(200, WIDE.hFOV, WIDE.vFOV)

  it('runs through the centre along the shadow bearing', () => {
    const line = shadowAcrossFootprint(CENTRE, 90, size.diagonalMeters)
    expect(line).toHaveLength(2)
    expect(bearingBetween(CENTRE, at(line[1]))).toBeCloseTo(90, 3)
    expect(bearingBetween(CENTRE, at(line[0]))).toBeCloseTo(270, 3)
  })

  it('spans the frame, so it crosses it at any yaw', () => {
    const line = shadowAcrossFootprint(CENTRE, 33, size.diagonalMeters)
    expect(distanceMeters(at(line[0]), at(line[1]))).toBeCloseTo(size.diagonalMeters, 0)
    expect(size.diagonalMeters).toBeGreaterThan(size.widthMeters)
  })

  it('is empty for a frame with no size', () => {
    expect(shadowAcrossFootprint(CENTRE, 90, 0)).toEqual([])
  })
})

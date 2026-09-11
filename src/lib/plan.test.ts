import { describe, expect, it } from 'vitest'
import { computeFOV, SENSORS } from '../core/fov.ts'
import { bearingBetween, type LatLon } from '../core/geo.ts'
import { getSunPosition } from '../core/sun.ts'
import type { Landcover, Ring } from '../core/siting.ts'
import { planPosition, planPositions, type CameraPosition } from './plan.ts'

/** Brew River, the calibration venue, at the actual dock bar. */
const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }
const SUBJECT: LatLon = { lat: 38.3639, lon: -75.6058 }
const sunAzimuth = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), VENUE.lat, VENUE.lon)
  .azimuth

const at = (lat: number, lon: number, over: Partial<CameraPosition> = {}): CameraPosition => ({
  id: 'p1',
  number: 1,
  at: { lat, lon },
  bodyId: 'a7iv',
  lensId: 'sony-200-600',
  focalLength: 400,
  shot: 'Boats hitting the pilings.',
  risk: 'Crowd on the rail.',
  platform: 'ground',
  altitudeFeet: 0,
  moved: false,
  ...over,
})

describe('planPosition', () => {
  const north = at(38.3648, -75.6059)
  const planned = planPosition(north, SUBJECT, sunAzimuth)

  it('points the camera at the subject, and the cone with it', () => {
    expect(planned.cameraBearing).toBeCloseTo(bearingBetween(north.at, SUBJECT), 6)
  })

  it('agrees with the lighting core about which way the camera faces', () => {
    /*
     * If these diverge the cone is drawn one way and labelled another.
     *
     * They are not bit identical and should not be. cameraBearing is the great
     * circle initial bearing from camera to subject; lighting.cameraBearing is
     * the reciprocal of the bearing measured the other way. Meridians converge,
     * so forward and back azimuths differ slightly. Over a few hundred metres
     * that is far below anything that could change a lighting call.
     */
    expect(Math.abs(planned.lighting.cameraBearing - planned.cameraBearing)).toBeLessThan(0.01)
  })

  it('takes the field of view from fov.ts, not from anywhere else', () => {
    expect(planned.fov).toEqual(computeFOV(400, SENSORS.fullFrame))
  })

  it('anchors the cone at the camera and closes the ring', () => {
    const [ring] = planned.cone
    expect(ring[0]).toEqual([north.at.lon, north.at.lat])
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('honours the forced APS-C crop when the lens demands it', () => {
    const cropped = planPosition(
      at(38.3648, -75.6059, { lensId: 'sony-10-18', focalLength: 10 }),
      SUBJECT,
      sunAzimuth,
    )
    expect(cropped.sensor).toBe('apsc')
    expect(cropped.fov).toEqual(computeFOV(10, SENSORS.apsc))
  })
})

describe('lighting is computed from position, never asserted', () => {
  it('calls a position north of the subject backlit at midday', () => {
    const plan = planPosition(at(38.3655, -75.6058), SUBJECT, sunAzimuth)
    expect(plan.lighting.classification).toBe('backlit')
  })

  it('calls a position south of the subject front-lit, the known right answer', () => {
    const plan = planPosition(at(38.3625, -75.6058), SUBJECT, sunAzimuth)
    expect(plan.lighting.classification).toBe('front-lit')
  })

  it('calls a position east of the subject side-lit', () => {
    const plan = planPosition(at(38.3639, -75.6035), SUBJECT, sunAzimuth)
    expect(plan.lighting.classification).toBe('side-lit')
  })

  it('re-lights every position when the subject moves', () => {
    const camera = at(38.3655, -75.6058)
    const before = planPosition(camera, SUBJECT, sunAzimuth)
    // Put the subject north of the camera instead of south of it.
    const after = planPosition(camera, { lat: 38.3672, lon: -75.6058 }, sunAzimuth)
    expect(before.lighting.classification).toBe('backlit')
    expect(after.lighting.classification).toBe('front-lit')
  })
})

describe('planPositions', () => {
  it('plans each position independently and keeps their order', () => {
    const plan = planPositions(
      [at(38.3655, -75.6058, { id: 'a', number: 1 }), at(38.3625, -75.6058, { id: 'b', number: 2 })],
      SUBJECT,
      sunAzimuth,
    )
    expect(plan.map((p) => p.position.id)).toEqual(['a', 'b'])
    expect(plan[0].lighting.classification).not.toBe(plan[1].lighting.classification)
  })

  it('returns nothing for no positions rather than throwing', () => {
    expect(planPositions([], SUBJECT, sunAzimuth)).toEqual([])
  })
})

describe('siting warnings', () => {
  const RIVER: Ring[] = [
    [
      [-75.607, 38.363],
      [-75.604, 38.363],
      [-75.604, 38.3645],
      [-75.607, 38.3645],
      [-75.607, 38.363],
    ],
  ]
  const LAND: Landcover = {
    water: [RIVER],
    roads: [
      {
        positions: [
          [-75.608, 38.3625],
          [-75.603, 38.3625],
        ],
        halfWidthMeters: 6,
      },
    ],
    structures: [],
  }

  it('reports nothing when there is no OSM data, exactly as before', () => {
    expect(planPosition(at(38.3638, -75.6055), SUBJECT, sunAzimuth).warnings).toEqual([])
  })

  it('flags a position the model dropped in the river', () => {
    const plan = planPosition(at(38.3638, -75.6055), SUBJECT, sunAzimuth, LAND)
    expect(plan.warnings).toEqual(['in-water'])
  })

  it('flags a position on a road centreline', () => {
    const plan = planPosition(at(38.3625, -75.6055), SUBJECT, sunAzimuth, LAND)
    expect(plan.warnings).toEqual(['in-roadway'])
  })

  it('leaves the coordinate exactly where it was, warning or not', () => {
    // Never silently moved. The shooter drags it themselves.
    const original = at(38.3638, -75.6055)
    const plan = planPosition(original, SUBJECT, sunAzimuth, LAND)
    expect(plan.position.at).toEqual(original.at)
    expect(plan.cone[0][0]).toEqual([original.at.lon, original.at.lat])
  })

  it('still computes lighting and field of view for a flagged position', () => {
    const plan = planPosition(at(38.3638, -75.6055), SUBJECT, sunAzimuth, LAND)
    expect(plan.lighting.classification).toBeTruthy()
    expect(plan.fov.hFOV).toBeGreaterThan(0)
  })

  it('checks every position in a plan', () => {
    const plan = planPositions(
      [at(38.3638, -75.6055, { id: 'wet' }), at(38.3655, -75.6055, { id: 'dry' })],
      SUBJECT,
      sunAzimuth,
      LAND,
    )
    expect(plan[0].warnings).toEqual(['in-water'])
    expect(plan[1].warnings).toEqual([])
  })
})

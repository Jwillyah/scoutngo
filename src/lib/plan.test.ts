import { describe, expect, it } from 'vitest'
import { computeFOV, frameWidthMeters, SENSORS } from '../core/fov.ts'
import { destinationPoint, distanceMeters } from '../core/geo.ts'
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
  lensId: 'sony-200-600',
  focalLength: 400,
  shot: 'Boats hitting the pilings.',
  risk: 'Crowd on the rail.',
  angleRationale: 'Pilings run away from camera, crowd behind.',
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


/*
 * Job 2: nothing used to constrain standoff, and the card's "Range" was the CONE
 * DRAW LENGTH, which overshoots the subject by 25 percent. A card reading 300m
 * for a position actually 240m out is a lie about the one number a shooter would
 * pace out.
 */
describe('range and framing', () => {
  const west = (metres: number) =>
    at(destinationPoint(SUBJECT, 270, metres).lat, destinationPoint(SUBJECT, 270, metres).lon)

  it('reports the TRUE distance to the subject, not the cone draw length', () => {
    const planned = planPosition(west(300), SUBJECT, sunAzimuth)
    expect(planned.subjectRangeMeters).toBeCloseTo(300, 0)
    expect(planned.subjectRangeMeters).toBeCloseTo(
      distanceMeters(planned.position.at, SUBJECT),
      6,
    )
    // The cone is still drawn past the subject so it reads as pointing at it.
    expect(planned.coneRangeMeters).toBeGreaterThan(planned.subjectRangeMeters)
  })

  it('computes frame width from the true range and the computed hFOV', () => {
    const planned = planPosition(west(300), SUBJECT, sunAzimuth)
    expect(planned.frameWidthMeters).toBeCloseTo(
      frameWidthMeters(planned.subjectRangeMeters, planned.fov.hFOV),
      6,
    )
    // 400mm on full frame at 300m: about 27 metres across.
    expect(planned.frameWidthMeters).toBeCloseTo(26.9, 0)
  })

  it('flags a wide lens parked far out, which is the reported failure', () => {
    // The same distance on the 400mm is fine; it is the focal length that decides.
    expect(planPosition(west(300), SUBJECT, sunAzimuth).framingWarnings).toEqual([])

    const wideAndFar = planPosition(
      { ...west(300), lensId: 'sigma-28-75', focalLength: 28 },
      SUBJECT,
      sunAzimuth,
    )
    expect(wideAndFar.framingWarnings).toContain('frame-too-wide')
  })

  it('leaves a sensible long lens position unflagged', () => {
    expect(planPosition(west(250), SUBJECT, sunAzimuth).framingWarnings).toEqual([])
  })

  it('carries the standoff band the model was given', () => {
    const planned = planPosition(west(250), SUBJECT, sunAzimuth)
    expect(planned.standoff.maxMeters).toBeGreaterThan(planned.standoff.minMeters)
    expect(planned.subjectRangeMeters).toBeLessThan(planned.standoff.maxMeters)
  })
})

/*
 * Job 3 and Job 5 meeting in one place: an air position resolves its optic from
 * the drone's fixed cameras, on the same computeFOV as the ground lenses, and no
 * body is involved anywhere.
 */
describe('drone optics', () => {
  const air = (cameraId: string, focal: number) =>
    at(38.3648, -75.6059, {
      platform: 'air',
      altitudeFeet: 200,
      lensId: cameraId,
      focalLength: focal,
    })

  it('takes the field of view from the 35mm equivalent on full frame', () => {
    const planned = planPosition(air('air-3s-wide', 24), SUBJECT, sunAzimuth)
    expect(planned.optic).toMatchObject({ kind: 'drone', id: 'air-3s-wide' })
    expect(planned.sensor).toBe('fullFrame')
    expect(planned.fov).toEqual(computeFOV(24, SENSORS.fullFrame))
  })

  it('draws the tele camera tighter than the wide one', () => {
    const wide = planPosition(air('air-3s-wide', 24), SUBJECT, sunAzimuth)
    const tele = planPosition(air('air-3s-tele', 70), SUBJECT, sunAzimuth)
    expect(tele.fov.hFOV).toBeLessThan(wide.fov.hFOV)
  })

  it('holds an air position to the shorter air standoff', () => {
    const wide = planPosition(air('air-3s-wide', 24), SUBJECT, sunAzimuth)
    expect(wide.standoff.maxMeters).toBeLessThanOrEqual(400)
  })
})

describe('no body is assigned to a position', () => {
  it('resolves the forced crop from the kit selection instead', () => {
    const wide = at(38.3648, -75.6059, { lensId: 'sony-10-18', focalLength: 10 })
    const withA7iv = planPosition(wide, SUBJECT, sunAzimuth, undefined, ['a7iv'])
    const withoutA7iv = planPosition(wide, SUBJECT, sunAzimuth, undefined, ['a7iii'])
    expect(withA7iv.sensor).toBe('apsc')
    expect(withoutA7iv.sensor).toBe('fullFrame')
    expect(withA7iv.fov.hFOV).toBeLessThan(withoutA7iv.fov.hFOV)
  })

  it('names the optic, and never a camera body', () => {
    const planned = planPosition(at(38.3648, -75.6059), SUBJECT, sunAzimuth)
    expect(planned.optic.name).toBe('Sony 200-600')
    expect(planned).not.toHaveProperty('body')
  })
})

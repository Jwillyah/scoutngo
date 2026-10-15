import { describe, expect, it } from 'vitest'
import { classificationOf, type LightingRead } from '../core/lighting.ts'
import { computeFOV, frameWidthMeters, SENSORS } from '../core/fov.ts'
import { destinationPoint, distanceMeters } from '../core/geo.ts'
import { bearingBetween, type LatLon } from '../core/geo.ts'
import { getSunPosition } from '../core/sun.ts'
import type { Landcover, Ring } from '../core/siting.ts'
import { assessPlan, planPosition, planPositions, type CameraPosition } from './plan.ts'

/** Brew River, the calibration venue, at the actual dock bar. */
const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }
const SUBJECT: LatLon = { lat: 38.3639, lon: -75.6058 }
/*
 * THE WHOLE SUN, because planPosition takes a SunPosition now rather than a
 * bare azimuth: a top-down read needs the altitude for shadow length and a 360
 * read needs it for where the sun sits against the horizon ring.
 */
const sun = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), VENUE.lat, VENUE.lon)

const at = (lat: number, lon: number, over: Partial<CameraPosition> = {}): CameraPosition => ({
  id: 'p1',
  number: 1,
  at: { lat, lon },
  lensId: 'sony-200-600',
  focalLength: 400,
  shot: 'Boats hitting the pilings.',
  risk: 'Crowd on the rail.',
  angleRationale: 'Pilings run away from camera, crowd behind.',
  coversShot: null,
  platform: 'ground',
  altitudeFeet: 0,
  shotType: 'framed',
  yawDegrees: 0,
  moved: false,
  origin: 'suggested',
  ...over,
})

/**
 * The framed half of a read, for assertions that are about a camera bearing.
 *
 * Throws rather than falling back, because a test that silently accepted a
 * non-framed read would be asserting nothing. classifyLighting refuses to
 * classify a shot type with no bearing; this is how a test says "I know this
 * one is framed".
 */
function framedOf(planned: { read: LightingRead }) {
  if (planned.read.shotType !== 'framed') throw new Error('expected a framed read')
  return planned.read
}

describe('planPosition', () => {
  const north = at(38.3648, -75.6059)
  const planned = planPosition(north, SUBJECT, sun)

  /** The MEASURED forward azimuth, off the aim, not derived from anything. */
  const aimOf = (p: typeof planned) => {
    if (p.aim.shotType !== 'framed') throw new Error('expected a framed aim')
    return p.aim
  }

  it('points the camera at the subject, and the cone with it', () => {
    expect(aimOf(planned).cameraBearing).toBeCloseTo(bearingBetween(north.at, SUBJECT), 6)
  })

  it('agrees with the lighting core about which way the camera faces', () => {
    /*
     * If these diverge the cone is drawn one way and labelled another.
     *
     * They are not bit identical and should not be. aim.cameraBearing is the
     * great circle initial bearing from camera to subject, measured by turf.
     * The lighting read's cameraBearing is the RECIPROCAL of the bearing
     * measured the other way, because that is what the classification
     * arithmetic works from. Meridians converge, so forward and back azimuths
     * differ slightly: measured here at 6e-5 degrees. Far below anything that
     * could change a lighting call, and the reason both are carried rather
     * than one being derived from the other.
     */
    const measured = aimOf(planned).cameraBearing
    const fromLighting = framedOf(planned).lighting.cameraBearing
    expect(Math.abs(measured - fromLighting)).toBeLessThan(0.01)
    expect(measured).not.toBe(fromLighting)
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
      sun,
    )
    expect(cropped.sensor).toBe('apsc')
    expect(cropped.fov).toEqual(computeFOV(10, SENSORS.apsc))
  })
})

describe('lighting is computed from position, never asserted', () => {
  it('calls a position north of the subject backlit at midday', () => {
    const plan = planPosition(at(38.3655, -75.6058), SUBJECT, sun)
    expect(classificationOf(plan.read)).toBe('backlit')
  })

  it('calls a position south of the subject front-lit, the known right answer', () => {
    const plan = planPosition(at(38.3625, -75.6058), SUBJECT, sun)
    expect(classificationOf(plan.read)).toBe('front-lit')
  })

  it('calls a position east of the subject side-lit', () => {
    const plan = planPosition(at(38.3639, -75.6035), SUBJECT, sun)
    expect(classificationOf(plan.read)).toBe('side-lit')
  })

  it('re-lights every position when the subject moves', () => {
    const camera = at(38.3655, -75.6058)
    const before = planPosition(camera, SUBJECT, sun)
    // Put the subject north of the camera instead of south of it.
    const after = planPosition(camera, { lat: 38.3672, lon: -75.6058 }, sun)
    expect(classificationOf(before.read)).toBe('backlit')
    expect(classificationOf(after.read)).toBe('front-lit')
  })
})

describe('planPositions', () => {
  it('plans each position independently and keeps their order', () => {
    const plan = planPositions(
      [at(38.3655, -75.6058, { id: 'a', number: 1 }), at(38.3625, -75.6058, { id: 'b', number: 2 })],
      SUBJECT,
      sun,
    )
    expect(plan.map((p) => p.position.id)).toEqual(['a', 'b'])
    expect(classificationOf(plan[0].read)).not.toBe(classificationOf(plan[1].read))
  })

  it('returns nothing for no positions rather than throwing', () => {
    expect(planPositions([], SUBJECT, sun)).toEqual([])
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
    expect(planPosition(at(38.3638, -75.6055), SUBJECT, sun).warnings).toEqual([])
  })

  it('flags a position the model dropped in the river', () => {
    const plan = planPosition(at(38.3638, -75.6055), SUBJECT, sun, LAND)
    expect(plan.warnings).toEqual(['in-water'])
  })

  it('flags a position on a road centreline', () => {
    const plan = planPosition(at(38.3625, -75.6055), SUBJECT, sun, LAND)
    expect(plan.warnings).toEqual(['in-roadway'])
  })

  it('leaves the coordinate exactly where it was, warning or not', () => {
    // Never silently moved. The shooter drags it themselves.
    const original = at(38.3638, -75.6055)
    const plan = planPosition(original, SUBJECT, sun, LAND)
    expect(plan.position.at).toEqual(original.at)
    expect(plan.cone[0][0]).toEqual([original.at.lon, original.at.lat])
  })

  it('still computes lighting and field of view for a flagged position', () => {
    const plan = planPosition(at(38.3638, -75.6055), SUBJECT, sun, LAND)
    expect(classificationOf(plan.read)).toBeTruthy()
    expect(plan.fov.hFOV).toBeGreaterThan(0)
  })

  it('checks every position in a plan', () => {
    const plan = planPositions(
      [at(38.3638, -75.6055, { id: 'wet' }), at(38.3655, -75.6055, { id: 'dry' })],
      SUBJECT,
      sun,
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
    const planned = planPosition(west(300), SUBJECT, sun)
    expect(planned.subjectRangeMeters).toBeCloseTo(300, 0)
    expect(planned.subjectRangeMeters).toBeCloseTo(
      distanceMeters(planned.position.at, SUBJECT),
      6,
    )
    // The cone is still drawn past the subject so it reads as pointing at it.
    expect(planned.coneRangeMeters).toBeGreaterThan(planned.subjectRangeMeters)
  })

  it('computes frame width from the true range and the computed hFOV', () => {
    const planned = planPosition(west(300), SUBJECT, sun)
    expect(planned.frameWidthMeters).toBeCloseTo(
      frameWidthMeters(planned.subjectRangeMeters, planned.fov.hFOV),
      6,
    )
    // 400mm on full frame at 300m: about 27 metres across.
    expect(planned.frameWidthMeters).toBeCloseTo(26.9, 0)
  })

  it('flags a wide lens parked far out, which is the reported failure', () => {
    // The same distance on the 400mm is fine; it is the focal length that decides.
    expect(planPosition(west(300), SUBJECT, sun).framingWarnings).toEqual([])

    const wideAndFar = planPosition(
      { ...west(300), lensId: 'sigma-28-75', focalLength: 28 },
      SUBJECT,
      sun,
    )
    expect(wideAndFar.framingWarnings).toContain('frame-too-wide')
  })

  it('leaves a sensible long lens position unflagged', () => {
    expect(planPosition(west(250), SUBJECT, sun).framingWarnings).toEqual([])
  })

  it('carries the standoff band the model was given', () => {
    const planned = planPosition(west(250), SUBJECT, sun)
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
    const planned = planPosition(air('air-3s-wide', 24), SUBJECT, sun)
    expect(planned.optic).toMatchObject({ kind: 'drone', id: 'air-3s-wide' })
    expect(planned.sensor).toBe('fullFrame')
    expect(planned.fov).toEqual(computeFOV(24, SENSORS.fullFrame))
  })

  it('draws the tele camera tighter than the wide one', () => {
    const wide = planPosition(air('air-3s-wide', 24), SUBJECT, sun)
    const tele = planPosition(air('air-3s-tele', 70), SUBJECT, sun)
    expect(tele.fov.hFOV).toBeLessThan(wide.fov.hFOV)
  })

  it('holds an air position to the shorter air standoff', () => {
    const wide = planPosition(air('air-3s-wide', 24), SUBJECT, sun)
    expect(wide.standoff.maxMeters).toBeLessThanOrEqual(400)
  })
})

describe('no body is assigned to a position', () => {
  it('resolves the forced crop from the kit selection instead', () => {
    const wide = at(38.3648, -75.6059, { lensId: 'sony-10-18', focalLength: 10 })
    const withA7iv = planPosition(wide, SUBJECT, sun, undefined, ['a7iv'])
    const withoutA7iv = planPosition(wide, SUBJECT, sun, undefined, ['a7iii'])
    expect(withA7iv.sensor).toBe('apsc')
    expect(withoutA7iv.sensor).toBe('fullFrame')
    expect(withA7iv.fov.hFOV).toBeLessThan(withoutA7iv.fov.hFOV)
  })

  it('names the optic, and never a camera body', () => {
    const planned = planPosition(at(38.3648, -75.6059), SUBJECT, sun)
    expect(planned.optic.name).toBe('Sony 200-600')
    expect(planned).not.toHaveProperty('body')
  })
})


/*
 * Coverage across the whole plan. A clustered set is REPORTED, never rejected:
 * a venue with one accessible bank genuinely has one, and the shooter knows that.
 */
describe('assessPlan', () => {
  const around = (bearing: number, metres = 250) => {
    const at_ = destinationPoint(SUBJECT, bearing, metres)
    return at(at_.lat, at_.lon)
  }

  it('calls six positions on one bank a cluster', () => {
    const plan = planPositions(
      [168, 175, 181, 186, 193, 199].map((b) => around(b)),
      SUBJECT,
      sun,
    )
    const { coverage } = assessPlan(plan)
    expect(coverage.clustered).toBe(true)
    expect(coverage.hasOppositeSide).toBe(false)
  })

  it('accepts a plan that works round the subject', () => {
    const plan = planPositions([20, 110, 200, 290].map((b) => around(b)), SUBJECT, sun)
    const { coverage } = assessPlan(plan)
    expect(coverage.clustered).toBe(false)
    expect(coverage.sectorCount).toBe(4)
    expect(coverage.hasOppositeSide).toBe(true)
  })

  /*
   * The real bug from a live run: a position placed on the venue pin, which is
   * also the default subject. Its bearing is arbitrary, and counting it could
   * satisfy the three sector rule with a direction that does not exist.
   */
  it('does not let a position sitting on the subject fake a sector', () => {
    const onSubject = at(SUBJECT.lat, SUBJECT.lon)
    const plan = planPositions([onSubject, around(180), around(190)], SUBJECT, sun)
    const { coverage } = assessPlan(plan)
    expect(coverage.withoutBearing).toBe(1)
    expect(coverage.bearings).toHaveLength(2)
    expect(coverage.clustered).toBe(true)
  })

  it('flags a plan parked entirely at the back', () => {
    // 30mm has a short ceiling, so 60m out is already near the back for it.
    const wide = [170, 180, 190].map((b) => ({
      ...around(b, 60),
      lensId: 'sigma-30',
      focalLength: 30,
    }))
    const { rangeVariety } = assessPlan(planPositions(wide, SUBJECT, sun))
    expect(rangeVariety.allNearMaxStandoff).toBe(true)
  })

  it('passes a plan with near work in it', () => {
    const mixed = [
      { ...around(20, 40), lensId: 'sigma-28-75', focalLength: 28 },
      around(200, 300),
      around(110, 150),
    ]
    const { rangeVariety } = assessPlan(planPositions(mixed, SUBJECT, sun))
    expect(rangeVariety.allNearMaxStandoff).toBe(false)
  })

  it('says nothing about an empty plan', () => {
    const { coverage } = assessPlan([])
    expect(coverage.sectorCount).toBe(0)
    expect(coverage.withoutBearing).toBe(0)
  })
})

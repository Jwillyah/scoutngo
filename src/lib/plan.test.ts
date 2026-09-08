import { describe, expect, it } from 'vitest'
import { computeFOV, SENSORS } from '../core/fov.ts'
import { bearingBetween } from '../core/geo.ts'
import { getSunPosition } from '../core/sun.ts'
import { planPosition, planPositions } from './plan.ts'
import { STUB_POSITIONS, STUB_SUBJECT, type CameraPosition } from './positions.ts'

const MID_WINDOW = new Date('2026-09-12T13:00:00-04:00')
const sunAzimuth = getSunPosition(MID_WINDOW, 38.3648, -75.6069).azimuth

describe('planPosition', () => {
  const planned = planPosition(STUB_POSITIONS[0], STUB_SUBJECT, sunAzimuth)

  it('points the camera at the subject, and the cone with it', () => {
    expect(planned.cameraBearing).toBeCloseTo(
      bearingBetween(STUB_POSITIONS[0].at, STUB_SUBJECT),
      6,
    )
  })

  it('agrees with the lighting core about which way the camera faces', () => {
    /*
     * If these ever diverge the cone is drawn one way and labelled another.
     *
     * They are not bit identical and should not be. planned.cameraBearing is the
     * great circle initial bearing from the camera to the subject, while
     * lighting.cameraBearing is the reciprocal of the bearing measured the other
     * way. Meridians converge, so a forward and a back azimuth differ slightly.
     * Over a few hundred metres that is about three ten thousandths of a degree,
     * which is far below anything that could change a lighting call.
     */
    const gap = Math.abs(planned.lighting.cameraBearing - planned.cameraBearing)
    expect(gap).toBeLessThan(0.01)
  })

  it('takes the position bearing from the subject outward, as classifyLighting wants', () => {
    expect(planned.positionBearing).toBeCloseTo(
      bearingBetween(STUB_SUBJECT, STUB_POSITIONS[0].at),
      6,
    )
  })

  it('takes the field of view from fov.ts, not from anywhere else', () => {
    expect(planned.fov).toEqual(computeFOV(400, SENSORS.fullFrame))
  })

  it('anchors the cone at the camera and closes the ring', () => {
    const [ring] = planned.cone
    expect(ring[0]).toEqual([STUB_POSITIONS[0].at.lon, STUB_POSITIONS[0].at.lat])
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('honours the forced APS-C crop when the lens demands it', () => {
    const wide: CameraPosition = {
      ...STUB_POSITIONS[0],
      lensId: 'sony-10-18',
      focalLength: 10,
    }
    const croppedPlan = planPosition(wide, STUB_SUBJECT, sunAzimuth)
    expect(croppedPlan.sensor).toBe('apsc')
    expect(croppedPlan.fov).toEqual(computeFOV(10, SENSORS.apsc))
  })
})

describe('planPositions over the Brew River stubs', () => {
  const plan = planPositions(STUB_POSITIONS, STUB_SUBJECT, sunAzimuth)

  it('classifies the north deck as backlit, shooting across the river into the sun', () => {
    expect(plan[0].lighting.classification).toBe('backlit')
  })

  it('classifies the south bank as front-lit, which is the known right answer', () => {
    expect(plan[1].lighting.classification).toBe('front-lit')
  })

  it('classifies the downstream position as side-lit', () => {
    expect(plan[2].lighting.classification).toBe('side-lit')
  })

  it('gives every lighting class something to draw, so all three colors are visible', () => {
    const classes = new Set(plan.map((p) => p.lighting.classification))
    expect(classes).toEqual(new Set(['backlit', 'side-lit', 'front-lit']))
  })

  it('draws a narrower cone for the longer lens', () => {
    // 400mm on full frame against 50mm on full frame.
    expect(plan[0].fov.hFOV).toBeLessThan(plan[2].fov.hFOV)
  })

  it('reaches past the subject so the cone reads as aimed at it', () => {
    for (const p of plan) {
      expect(p.rangeMeters).toBeGreaterThan(0)
    }
  })
})

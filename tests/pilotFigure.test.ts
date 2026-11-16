import { describe, expect, it } from 'vitest'
import { bearingBetween, distanceMeters } from '../src/core/geo.ts'
import { START } from '../src/core/flyModel.ts'
import { PILOT_BEHIND_M, PILOT_HIDE_WITHIN_M, pilotShown, pilotSpot } from '../src/core/pilotFigure.ts'

/*
 * THE WHITE SHAPE 5 FT IN FRONT OF THE FLY CAMERA (Batch CORE, Section 2;
 * Batch DRONE, Section 2.5): the pilot figure stood on the takeoff point,
 * about half a metre from the camera at takeoff.
 */
const takeoff = { lat: 36.8435575, lon: -75.9713104 }

describe('the pilot figure in Fly', () => {
  it('stands 4 m behind takeoff, opposite the start heading (north: so to the south)', () => {
    const p = pilotSpot(takeoff, START.yaw)
    expect(distanceMeters(takeoff, p)).toBeCloseTo(PILOT_BEHIND_M, 1)
    expect(Math.round(bearingBetween(takeoff, p))).toBe(180)
    expect(Math.round(bearingBetween(takeoff, pilotSpot(takeoff, 270)))).toBe(90)
  })
  it('is hidden while the drone is within 10 m, drawn from 10 m out', () => {
    expect(PILOT_HIDE_WITHIN_M).toBe(10)
    /* At takeoff the drone is 4 m from it: hidden. */
    expect(pilotShown(PILOT_BEHIND_M)).toBe(false)
    expect(pilotShown(9.9)).toBe(false)
    expect(pilotShown(10)).toBe(true)
    expect(pilotShown(300)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  cameraBearingOf,
  DEFAULT_SHOT_TYPE,
  DEFAULT_YAW_DEGREES,
  drawsCone,
  hasCameraBearing,
  PIN_ROLE,
  SHOT_TYPE_LABEL,
  SHOT_TYPE_NOTE,
  SHOT_TYPES,
  type Aim,
} from './shotType.ts'

describe('framed is the default and stays the default', () => {
  it('is framed', () => {
    expect(DEFAULT_SHOT_TYPE).toBe('framed')
  })

  /*
   * A client event shoot uses nothing but framed positions and must look
   * exactly as it did. The other two are only ever reached by choosing them.
   */
  it('offers framed first', () => {
    expect(SHOT_TYPES[0]).toBe('framed')
    expect(SHOT_TYPES).toEqual(['framed', 'top-down', 'orbit'])
  })

  it('starts a top-down frame north up', () => {
    expect(DEFAULT_YAW_DEGREES).toBe(0)
  })

  it('names and explains every type', () => {
    for (const type of SHOT_TYPES) {
      expect(SHOT_TYPE_LABEL[type]).toBeTruthy()
      expect(SHOT_TYPE_NOTE[type].length).toBeGreaterThan(20)
      expect(PIN_ROLE[type].length).toBeGreaterThan(10)
    }
  })
})

/*
 * ONLY A FRAMED SHOT AIMS THE CAMERA AT ANYTHING.
 *
 * A 360 sees every direction; a top-down sees the ground. Feeding either a
 * made up bearing is the same class of mistake as a coordinate falling back to
 * Null Island, so there is no bearing to feed.
 */
describe('which shot types have a camera bearing', () => {
  it('is framed, and only framed', () => {
    expect(hasCameraBearing('framed')).toBe(true)
    expect(hasCameraBearing('top-down')).toBe(false)
    expect(hasCameraBearing('orbit')).toBe(false)
  })

  it('reads the measured bearing off a framed aim', () => {
    const aim: Aim = { shotType: 'framed', positionBearing: 10, cameraBearing: 190.5 }
    expect(cameraBearingOf(aim)).toBe(190.5)
  })

  /*
   * NOT DERIVED FROM positionBearing. Forward and reverse azimuths between two
   * points differ by the convergence of the meridians, so the bearing shown on
   * the card is the one turf measured rather than a reciprocal of the other.
   */
  it('does not recompute it as the reciprocal of the position bearing', () => {
    const aim: Aim = { shotType: 'framed', positionBearing: 10, cameraBearing: 190.00006 }
    expect(cameraBearingOf(aim)).toBe(190.00006)
    expect(cameraBearingOf(aim)).not.toBe(190)
  })

  it('has none for a top-down, whatever the yaw is', () => {
    expect(cameraBearingOf({ shotType: 'top-down', yawDegrees: 0 })).toBeNull()
    expect(cameraBearingOf({ shotType: 'top-down', yawDegrees: 137 })).toBeNull()
  })

  it('has none for a 360', () => {
    expect(cameraBearingOf({ shotType: 'orbit' })).toBeNull()
  })

  /*
   * THE YAW IS NOT A CAMERA BEARING. A top-down points at the ground whatever
   * the yaw says; the yaw turns the rectangle. If this ever started coming
   * back as a bearing, the whole refusal would be undone quietly.
   */
  it('never returns the yaw as a bearing', () => {
    for (const yawDegrees of [0, 45, 90, 180, 270, 359]) {
      expect(cameraBearingOf({ shotType: 'top-down', yawDegrees })).toBeNull()
    }
  })
})

describe('which shot types draw a cone', () => {
  it('is framed, and only framed', () => {
    expect(drawsCone('framed')).toBe(true)
    expect(drawsCone('top-down')).toBe(false)
    expect(drawsCone('orbit')).toBe(false)
  })

  /*
   * The two questions are the same question today and are deliberately
   * separate names, because a cone IS a claim about a direction: if they ever
   * diverge, something is drawing a direction it does not have.
   */
  it('agrees with hasCameraBearing, because a cone is a direction', () => {
    for (const type of SHOT_TYPES) {
      expect(drawsCone(type)).toBe(hasCameraBearing(type))
    }
  })
})

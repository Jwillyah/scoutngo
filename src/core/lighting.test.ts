import { describe, expect, it } from 'vitest'
import { altitudeNote, classificationOf, classifyLighting, evaluateWindow } from './lighting.ts'
import type { Aim } from './shotType.ts'
import type { SunPosition } from './sun.ts'

// positionBearing is FROM the venue TO the camera. cameraBearing is the reciprocal.
const fromCameraBearing = (cameraBearing: number) => (cameraBearing + 180) % 360

/** A sun, for the cases that only care where it is and not how high. */
const sunAt = (azimuth: number, altitude = 30): SunPosition => ({
  azimuth,
  altitude,
  shadowBearing: (azimuth + 180) % 360,
})

/**
 * THE FRAMED READ, UNWRAPPED, so the assertions below read as they always did.
 *
 * classifyLighting takes an Aim now and returns a read whose shape depends on
 * the shot type. There is deliberately no entry point that takes a bare
 * bearing: see the export-surface test at the bottom of this file. This helper
 * is the test's own way through the gate, and it throws rather than falling
 * back if the read is not the framed one, because a silent fallback here would
 * be testing nothing.
 */
/** A framed aim, for evaluateWindow. */
/*
 * A framed aim for the tests. cameraBearing is the exact reciprocal here on
 * purpose: these cases are about the lighting arithmetic, which reads
 * positionBearing, and a test that invented a different forward azimuth would
 * be testing turf rather than this module.
 */
const aimAt = (positionBearing: number): Aim => ({
  shotType: 'framed',
  positionBearing,
  cameraBearing: (positionBearing + 180) % 360,
})

const framed = (positionBearing: number, sunAzimuth: number, altitude = 30) => {
  const read = classifyLighting(aimAt(positionBearing), sunAt(sunAzimuth, altitude))
  if (read.shotType !== 'framed') throw new Error('expected a framed read')
  return read.lighting
}

describe('classifyLighting', () => {
  it('THE PROTOTYPE FAILURE: camera pointing 135 with the sun at 134 is backlit', () => {
    // The prototype put a camera northwest of the venue, pointing southeast at 135,
    // sun at 134, and called it "sun behind camera, front-lit". It is the opposite.
    const result = framed(fromCameraBearing(135), 134)
    expect(result.cameraBearing).toBeCloseTo(135, 10)
    expect(result.delta).toBeCloseTo(1, 10)
    expect(result.classification).toBe('backlit')
  })

  it('camera south of the venue with the sun due south is front-lit', () => {
    const result = framed(180, 180)
    expect(result.cameraBearing).toBeCloseTo(0, 10)
    expect(result.delta).toBeCloseTo(180, 10)
    expect(result.classification).toBe('front-lit')
  })

  it('camera north of the venue with the sun due south is backlit', () => {
    const result = framed(0, 180)
    expect(result.cameraBearing).toBeCloseTo(180, 10)
    expect(result.delta).toBeCloseTo(0, 10)
    expect(result.classification).toBe('backlit')
  })

  it('wraps around north: camera pointing 350 with the sun at 10 is delta 20, backlit', () => {
    const result = framed(fromCameraBearing(350), 10)
    expect(result.cameraBearing).toBeCloseTo(350, 10)
    expect(result.delta).toBeCloseTo(20, 10)
    expect(result.classification).toBe('backlit')
  })

  it('classifies the middle band as side-lit', () => {
    expect(framed(fromCameraBearing(90), 180).classification).toBe('side-lit')
    expect(framed(fromCameraBearing(180), 90).classification).toBe('side-lit')
  })

  it('holds the boundaries: 45 is side-lit, 135 is side-lit', () => {
    expect(framed(fromCameraBearing(45), 0).delta).toBeCloseTo(45, 10)
    expect(framed(fromCameraBearing(45), 0).classification).toBe('side-lit')
    expect(framed(fromCameraBearing(135), 0).delta).toBeCloseTo(135, 10)
    expect(framed(fromCameraBearing(135), 0).classification).toBe('side-lit')
  })

  it('never reports a delta outside 0 to 180', () => {
    for (let position = 0; position < 360; position += 7) {
      for (let sun = 0; sun < 360; sun += 11) {
        const { delta } = framed(position, sun)
        expect(delta).toBeGreaterThanOrEqual(0)
        expect(delta).toBeLessThanOrEqual(180)
      }
    }
  })

  it('handles unnormalised inputs', () => {
    expect(framed(-45, 400).classification).toBe(
      framed(315, 40).classification,
    )
  })
})

describe('altitudeNote', () => {
  it('flags low sun below 15 degrees', () => {
    expect(altitudeNote(0)).toBe('low sun, long shadows, flare risk')
    expect(altitudeNote(14.9)).toBe('low sun, long shadows, flare risk')
    expect(altitudeNote(-5)).toBe('low sun, long shadows, flare risk')
  })

  it('flags flat light above 60 degrees', () => {
    expect(altitudeNote(60.1)).toBe('flat overhead light')
    expect(altitudeNote(89)).toBe('flat overhead light')
  })

  it('calls the middle band workable, boundaries included', () => {
    expect(altitudeNote(15)).toBe('workable')
    expect(altitudeNote(40)).toBe('workable')
    expect(altitudeNote(60)).toBe('workable')
  })
})

describe('evaluateWindow', () => {
  const BREW_RIVER = { lat: 38.3648, lon: -75.6069 }
  const start = new Date('2026-09-12T11:00:00-04:00')
  const end = new Date('2026-09-12T15:00:00-04:00')

  it('samples start, middle and end independently', () => {
    const w = evaluateWindow(aimAt(0), BREW_RIVER.lat, BREW_RIVER.lon, start, end)
    expect(w.start.at.toISOString()).toBe(start.toISOString())
    expect(w.end.at.toISOString()).toBe(end.toISOString())
    expect(w.middle.at.toISOString()).toBe(new Date('2026-09-12T13:00:00-04:00').toISOString())
    // Sun tracks westward across the window.
    expect(w.start.sun.azimuth).toBeLessThan(w.middle.sun.azimuth)
    expect(w.middle.sun.azimuth).toBeLessThan(w.end.sun.azimuth)
  })

  it('reports flips=false when the classification holds all window long', () => {
    // South bank over a tight hour around solar noon: camera looks north, sun
    // stays behind it the whole time.
    const w = evaluateWindow(
      aimAt(180),
      BREW_RIVER.lat,
      BREW_RIVER.lon,
      new Date('2026-09-12T12:30:00-04:00'),
      new Date('2026-09-12T13:30:00-04:00'),
    )
    expect(classificationOf(w.start.read)).toBe('front-lit')
    expect(classificationOf(w.middle.read)).toBe('front-lit')
    expect(classificationOf(w.end.read)).toBe('front-lit')
    expect(w.flips).toBe(false)
  })

  it('reports flips=true when a long window changes the answer', () => {
    // Camera due east of the venue looks west; the sun crosses from behind it to in front.
    const dawnToDusk = evaluateWindow(
      aimAt(90),
      BREW_RIVER.lat,
      BREW_RIVER.lon,
      new Date('2026-09-12T08:00:00-04:00'),
      new Date('2026-09-12T18:00:00-04:00'),
    )
    expect(classificationOf(dawnToDusk.start.read)).not.toBe(classificationOf(dawnToDusk.end.read))
    expect(dawnToDusk.flips).toBe(true)
  })

  it('carries the altitude note for each sample', () => {
    const w = evaluateWindow(aimAt(180), BREW_RIVER.lat, BREW_RIVER.lon, start, end)
    expect(w.middle.altitudeNote).toBe('workable')
    expect(w.middle.sun.altitude).toBeGreaterThan(15)
  })
})

/*
 * THE REFUSAL, WHICH IS THE POINT OF THIS MODULE'S NEW SHAPE.
 *
 * A lighting class is a statement about where the camera points relative to
 * the sun. Two of the three shot types do not point the camera at anything, so
 * there is nothing to classify, and the authority file says so rather than
 * inventing a bearing.
 */
describe('lighting refuses where there is no bearing', () => {
  const sun = sunAt(134, 20)

  it('classifies a framed shot, as it always did', () => {
    const read = classifyLighting(aimAt(fromCameraBearing(135)), sun)
    expect(read.shotType).toBe('framed')
    expect(classificationOf(read)).toBe('backlit')
  })

  it('returns no classification at all for a top-down', () => {
    const read = classifyLighting({ shotType: 'top-down', yawDegrees: 0 }, sun)
    expect(read.shotType).toBe('top-down')
    expect(classificationOf(read)).toBeNull()
    // Not a field that is present and empty. Not present.
    expect(read).not.toHaveProperty('lighting')
  })

  it('returns no classification at all for a 360', () => {
    const read = classifyLighting({ shotType: 'orbit' }, sun)
    expect(read.shotType).toBe('orbit')
    expect(classificationOf(read)).toBeNull()
    expect(read).not.toHaveProperty('lighting')
  })

  /*
   * THE EXPORT SURFACE IS THE GATE.
   *
   * The arithmetic that takes a bare bearing is private to this module. If a
   * numeric entry point is ever exported again, a caller holding a 360 can
   * pass it anything and the refusal is gone. An absence is easy to undo by
   * accident, so it is asserted.
   */
  it('exports no way to classify from a bare bearing', async () => {
    const module = await import('./lighting.ts')
    expect(module).not.toHaveProperty('classifyFromPositionBearing')
    expect(module).not.toHaveProperty('classifyFromCameraBearing')

    // classifyLighting itself must refuse a number where an Aim belongs.
    const asUnknown = module.classifyLighting as unknown as (a: unknown, b: unknown) => unknown
    expect(() => asUnknown(180, 134)).toThrow()
  })
})

/*
 * WHAT IS TRUE FOR A TOP-DOWN INSTEAD: the shadows. A nadir shot at a low sun
 * is a picture OF the shadows, so direction and length are the whole read.
 */
describe('the top-down read', () => {
  it('gives the shadow bearing, which is the sun reversed', () => {
    const read = classifyLighting({ shotType: 'top-down', yawDegrees: 0 }, sunAt(90, 30))
    if (read.shotType !== 'top-down') throw new Error('expected a top-down read')
    expect(read.shadowBearing).toBeCloseTo(270, 6)
  })

  it('gives the shadow length as a multiple of what casts it', () => {
    // 45 degrees: a thing throws exactly its own height.
    const read = classifyLighting({ shotType: 'top-down', yawDegrees: 0 }, sunAt(180, 45))
    if (read.shotType !== 'top-down') throw new Error('expected a top-down read')
    expect(read.shadowLengthRatio).toBeCloseTo(1, 6)
    expect(read.shadowLength).toBe('medium')
  })

  it('calls a very low sun raking, which is the band the shot is chasing', () => {
    const read = classifyLighting({ shotType: 'top-down', yawDegrees: 0 }, sunAt(90, 5))
    if (read.shotType !== 'top-down') throw new Error('expected a top-down read')
    expect(read.shadowLengthRatio).toBeGreaterThan(11)
    expect(read.shadowLength).toBe('raking')
  })

  it('has no shadow below the horizon, and says so rather than dividing by zero', () => {
    const read = classifyLighting({ shotType: 'top-down', yawDegrees: 0 }, sunAt(90, -4))
    if (read.shotType !== 'top-down') throw new Error('expected a top-down read')
    expect(read.shadowLengthRatio).toBeNull()
    expect(read.shadowLength).toBe('none')
    expect(Number.isFinite(read.shadowLengthRatio ?? 0)).toBe(true)
  })

  /*
   * HOW THE SHADOWS SIT AGAINST THE FRAME, which is what the yaw is for: you
   * choose it freely, so you can line the shadows up with the rectangle.
   */
  it('says how far off the frame the shadows run', () => {
    const square = classifyLighting({ shotType: 'top-down', yawDegrees: 270 }, sunAt(90, 30))
    if (square.shotType !== 'top-down') throw new Error('expected a top-down read')
    // Shadows toward 270, frame turned to 270: dead along the frame.
    expect(square.shadowAgainstFrame).toBeCloseTo(0, 6)

    const across = classifyLighting({ shotType: 'top-down', yawDegrees: 0 }, sunAt(90, 30))
    if (across.shotType !== 'top-down') throw new Error('expected a top-down read')
    expect(across.shadowAgainstFrame).toBeCloseTo(90, 6)
  })

  /* A rectangle repeats every 180, so 10 off and 170 off are the same picture. */
  it('folds the frame angle to 0..90, because a rectangle has no front', () => {
    for (const yawDegrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const read = classifyLighting({ shotType: 'top-down', yawDegrees }, sunAt(123, 25))
      if (read.shotType !== 'top-down') throw new Error('expected a top-down read')
      expect(read.shadowAgainstFrame).toBeGreaterThanOrEqual(0)
      expect(read.shadowAgainstFrame).toBeLessThanOrEqual(90)
    }
  })

  it('reports the yaw it was given, normalised, and never as a bearing', () => {
    const read = classifyLighting({ shotType: 'top-down', yawDegrees: 365 }, sunAt(90, 30))
    if (read.shotType !== 'top-down') throw new Error('expected a top-down read')
    expect(read.yawDegrees).toBeCloseTo(5, 6)
  })
})

/*
 * AND FOR A 360: where the sun sits on the horizon ring, and flare, because a
 * 360 cannot avoid having the sun in frame.
 */
describe('the 360 read', () => {
  it('gives where the sun sits on the ring', () => {
    const read = classifyLighting({ shotType: 'orbit' }, sunAt(118, 8))
    if (read.shotType !== 'orbit') throw new Error('expected an orbit read')
    expect(read.sunBearing).toBeCloseTo(118, 6)
    expect(read.sunAltitude).toBeCloseTo(8, 6)
  })

  it('calls a low sun a high flare risk, because it is in frame regardless', () => {
    const low = classifyLighting({ shotType: 'orbit' }, sunAt(90, 4))
    if (low.shotType !== 'orbit') throw new Error('expected an orbit read')
    expect(low.flareRisk).toBe('high')
  })

  it('eases off as the sun climbs', () => {
    const mid = classifyLighting({ shotType: 'orbit' }, sunAt(90, 20))
    const high = classifyLighting({ shotType: 'orbit' }, sunAt(90, 50))
    if (mid.shotType !== 'orbit' || high.shotType !== 'orbit') throw new Error('expected orbit')
    expect(mid.flareRisk).toBe('moderate')
    expect(high.flareRisk).toBe('none')
  })

  it('has no direct flare under the horizon', () => {
    const down = classifyLighting({ shotType: 'orbit' }, sunAt(90, -3))
    if (down.shotType !== 'orbit') throw new Error('expected an orbit read')
    expect(down.flareRisk).toBe('none')
    // But it still says WHERE the sun is, which is the whole point pre-sunrise.
    expect(down.sunBearing).toBeCloseTo(90, 6)
    expect(down.sunAltitude).toBeCloseTo(-3, 6)
  })
})

/*
 * A WINDOW CANNOT FLIP IF THERE IS NOTHING TO FLIP BETWEEN. A 360 at the start
 * of a window and a 360 at the end of it are the same 360.
 */
describe('evaluateWindow with no bearing', () => {
  const LAT = 38.364236
  const LON = -75.605912
  const start = new Date('2026-09-12T08:00:00-04:00')
  const end = new Date('2026-09-12T18:00:00-04:00')

  it('never reports a flip for a 360', () => {
    const w = evaluateWindow({ shotType: 'orbit' }, LAT, LON, start, end)
    expect(w.flips).toBe(false)
    expect(classificationOf(w.start.read)).toBeNull()
    expect(classificationOf(w.end.read)).toBeNull()
  })

  it('never reports a flip for a top-down', () => {
    const w = evaluateWindow({ shotType: 'top-down', yawDegrees: 30 }, LAT, LON, start, end)
    expect(w.flips).toBe(false)
  })

  /* It still samples the sun, so the shadows move across the window. */
  it('still moves the shadows across the window', () => {
    const w = evaluateWindow({ shotType: 'top-down', yawDegrees: 0 }, LAT, LON, start, end)
    if (w.start.read.shotType !== 'top-down' || w.end.read.shotType !== 'top-down') {
      throw new Error('expected top-down reads')
    }
    expect(w.start.read.shadowBearing).not.toBeCloseTo(w.end.read.shadowBearing, 1)
  })

  it('still flips a framed shot, exactly as before', () => {
    const w = evaluateWindow(aimAt(90), LAT, LON, start, end)
    expect(w.flips).toBe(true)
  })
})

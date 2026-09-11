import { describe, expect, it } from 'vitest'
import {
  classifyFraming,
  computeFOV,
  frameWidthMeters,
  PRACTICAL_MAX_STANDOFF_METERS,
  rangeForFrameWidth,
  SENSORS,
  standoffBand,
  USABLE_FRAME_WIDTH_METERS,
} from './fov.ts'

describe('computeFOV', () => {
  it('200mm on full frame is about 10.3 horizontal and 6.9 vertical', () => {
    const { hFOV, vFOV } = computeFOV(200, SENSORS.fullFrame)
    expect(hFOV).toBeCloseTo(10.3, 1)
    expect(vFOV).toBeCloseTo(6.9, 1)
  })

  it('600mm on full frame is a narrow tunnel', () => {
    const { hFOV, vFOV } = computeFOV(600, SENSORS.fullFrame)
    expect(hFOV).toBeCloseTo(3.43, 2)
    expect(vFOV).toBeCloseTo(2.29, 2)
  })

  it('10mm on APS-C, the forced crop case, is wide', () => {
    const { hFOV, vFOV } = computeFOV(10, SENSORS.apsc)
    expect(hFOV).toBeCloseTo(99.2, 1)
    expect(vFOV).toBeCloseTo(75.9, 1)
  })

  it('vertical FOV is always narrower than horizontal on these sensors', () => {
    for (const sensor of Object.values(SENSORS)) {
      for (const focal of [10, 28, 75, 200, 600]) {
        const { hFOV, vFOV } = computeFOV(focal, sensor)
        expect(vFOV).toBeLessThan(hFOV)
      }
    }
  })

  it('narrows monotonically as focal length grows', () => {
    const focals = [10, 18, 28, 75, 200, 300, 600]
    const widths = focals.map((f) => computeFOV(f, SENSORS.fullFrame).hFOV)
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThan(widths[i - 1])
    }
  })

  it('a crop sensor is tighter than full frame at the same focal length', () => {
    expect(computeFOV(28, SENSORS.apsc).hFOV).toBeLessThan(computeFOV(28, SENSORS.fullFrame).hFOV)
  })
})

describe('frameWidthMeters', () => {
  /*
   * The number Job 2 is built on: how much ground is across the frame at the
   * subject. Hand checked against 2 * range * tan(hFOV / 2).
   */
  it('a 400mm on full frame at 300m frames about 27 metres', () => {
    const { hFOV } = computeFOV(400, SENSORS.fullFrame)
    expect(frameWidthMeters(300, hFOV)).toBeCloseTo(26.9, 1)
  })

  it('a 28mm at the same distance frames the whole riverbank', () => {
    const { hFOV } = computeFOV(28, SENSORS.fullFrame)
    expect(frameWidthMeters(300, hFOV)).toBeGreaterThan(350)
  })

  it('is zero at zero range and grows linearly with distance', () => {
    const { hFOV } = computeFOV(200, SENSORS.fullFrame)
    expect(frameWidthMeters(0, hFOV)).toBe(0)
    expect(frameWidthMeters(200, hFOV)).toBeCloseTo(2 * frameWidthMeters(100, hFOV), 6)
  })

  it('round trips through rangeForFrameWidth', () => {
    for (const focal of [24, 70, 200, 600]) {
      const { hFOV } = computeFOV(focal, SENSORS.fullFrame)
      expect(rangeForFrameWidth(frameWidthMeters(250, hFOV), hFOV)).toBeCloseTo(250, 6)
    }
  })
})

describe('standoffBand', () => {
  it('lets a longer lens stand further back', () => {
    const short = standoffBand(computeFOV(28, SENSORS.fullFrame).hFOV, 'ground')
    const long = standoffBand(computeFOV(600, SENSORS.fullFrame).hFOV, 'ground')
    expect(long.maxMeters).toBeGreaterThan(short.maxMeters)
    expect(long.minMeters).toBeGreaterThan(short.minMeters)
  })

  /*
   * A 600mm frames 60 metres from a kilometre away and the arithmetic is happy
   * about it. The picture is not, so the practical cap bites before the frame
   * width limit does.
   */
  it('caps long glass at the practical standoff, not at the frame width', () => {
    const { hFOV } = computeFOV(600, SENSORS.fullFrame)
    expect(rangeForFrameWidth(USABLE_FRAME_WIDTH_METERS.max, hFOV)).toBeGreaterThan(900)
    expect(standoffBand(hFOV, 'ground').maxMeters).toBe(PRACTICAL_MAX_STANDOFF_METERS.ground)
  })

  it('holds air shorter than ground, for visual line of sight', () => {
    const { hFOV } = computeFOV(24, SENSORS.fullFrame)
    expect(PRACTICAL_MAX_STANDOFF_METERS.air).toBeLessThan(PRACTICAL_MAX_STANDOFF_METERS.ground)
    expect(standoffBand(hFOV, 'air').maxMeters).toBeLessThanOrEqual(
      PRACTICAL_MAX_STANDOFF_METERS.air,
    )
  })

  it('always leaves a usable band', () => {
    for (const focal of [10, 24, 28, 70, 200, 600]) {
      const band = standoffBand(computeFOV(focal, SENSORS.fullFrame).hFOV, 'ground')
      expect(band.maxMeters).toBeGreaterThan(band.minMeters)
    }
  })
})

describe('classifyFraming', () => {
  const hFOV = (focal: number) => computeFOV(focal, SENSORS.fullFrame).hFOV

  it('passes a 400mm at a sensible standoff', () => {
    expect(classifyFraming(280, hFOV(400), 'ground')).toEqual([])
  })

  /* The reported failure: a wide lens parked far away, framing a whole field. */
  it('flags a wide lens standing much too far back', () => {
    expect(classifyFraming(300, hFOV(28), 'ground')).toContain('frame-too-wide')
  })

  it('flags a long lens beyond the practical standoff even when the frame is tight', () => {
    const warnings = classifyFraming(800, hFOV(600), 'ground')
    expect(warnings).toContain('beyond-standoff')
    expect(warnings).not.toContain('frame-too-wide')
  })

  /*
   * Deliberately NOT flagged. Seventy percent of this shooter's ground time is on
   * long glass, and a two metre frame at four hundred metres is the 600mm doing
   * its job. Flagging it would cry wolf on the most common correct position.
   */
  it('says nothing about a very tight frame from long glass', () => {
    expect(classifyFraming(400, hFOV(600), 'ground')).toEqual([])
  })

  it('says nothing about a position sitting on the subject', () => {
    expect(classifyFraming(0, hFOV(28), 'ground')).toEqual([])
  })
})

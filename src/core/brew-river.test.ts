import { describe, expect, it } from 'vitest'
import {
  altitudeNote,
  classificationOf,
  classifyLighting,
  evaluateWindow,
} from './lighting.ts'
import type { Aim } from './shotType.ts'
import { getSunPosition, type SunPosition } from './sun.ts'

/**
 * Calibration case from the brief: Brew River Dock Bar, Salisbury MD, on a
 * Saturday afternoon. The river runs southwest to northeast, the bar and the
 * crowd are on the north bank, and public access is on the south bank along
 * Riverside Drive. The known right answer is that the south bank is the strong
 * position, because shooting from the north bank means shooting into the sun.
 */
// The actual dock bar. The earlier values were about 100m off.
const LAT = 38.364236
const LON = -75.605912
// 13:00 America/New_York on Sat 12 Sept 2026. EDT is UTC-4, written as an
// explicit offset so the test does not depend on the machine's timezone.
const AT_1300 = new Date('2026-09-12T13:00:00-04:00')

// positionBearing is FROM the venue TO the camera position.
const NORTH_BANK = 0
const SOUTH_BANK = 180


const sunAt = (azimuth: number, altitude = 30): SunPosition => ({
  azimuth,
  altitude,
  shadowBearing: (azimuth + 180) % 360,
})
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

/** The framed read, unwrapped, so these assertions read as they always did. */
const framed = (positionBearing: number, sunAzimuth: number) => {
  const read = classifyLighting(aimAt(positionBearing), sunAt(sunAzimuth))
  if (read.shotType !== 'framed') throw new Error('expected a framed read')
  return read.lighting
}

describe('Brew River calibration', () => {
  it('is in fact a Saturday afternoon in EDT', () => {
    expect(AT_1300.toISOString()).toBe('2026-09-12T17:00:00.000Z')
    expect(AT_1300.getUTCDay()).toBe(6)
  })

  it('puts the sun roughly south and well above the horizon at 13:00', () => {
    const { azimuth, altitude } = getSunPosition(AT_1300, LAT, LON)
    expect(azimuth).toBeGreaterThan(160)
    expect(azimuth).toBeLessThan(210)
    expect(altitude).toBeGreaterThan(0)
  })

  it('casts shadows roughly north', () => {
    const { shadowBearing } = getSunPosition(AT_1300, LAT, LON)
    const offFromNorth = Math.min(shadowBearing, 360 - shadowBearing)
    expect(offFromNorth).toBeLessThan(30)
  })

  it('calls a north bank position backlit', () => {
    const { azimuth } = getSunPosition(AT_1300, LAT, LON)
    const result = framed(NORTH_BANK, azimuth)
    expect(result.classification).toBe('backlit')
  })

  it('calls a south bank position front-lit', () => {
    const { azimuth } = getSunPosition(AT_1300, LAT, LON)
    const result = framed(SOUTH_BANK, azimuth)
    expect(result.classification).toBe('front-lit')
  })

  it('keeps the south bank the stronger position across the whole 11:00 to 15:00 window', () => {
    const start = new Date('2026-09-12T11:00:00-04:00')
    const end = new Date('2026-09-12T15:00:00-04:00')

    const south = evaluateWindow(aimAt(SOUTH_BANK), LAT, LON, start, end)
    const north = evaluateWindow(aimAt(NORTH_BANK), LAT, LON, start, end)

    // The south bank is front-lit through the core of the window and never
    // worse than side-lit at the edges: it is never a bad call.
    expect(classificationOf(south.middle.read)).toBe('front-lit')
    for (const sample of [south.start, south.middle, south.end]) {
      expect(classificationOf(sample.read)).not.toBe('backlit')
    }

    // The north bank is the mirror image: backlit at the core, never front-lit.
    expect(classificationOf(north.middle.read)).toBe('backlit')
    for (const sample of [north.start, north.middle, north.end]) {
      expect(classificationOf(sample.read)).not.toBe('front-lit')
    }

    // Both banks change label across four hours, which is exactly why the
    // window is sampled at three points rather than once.
    expect(south.flips).toBe(true)
    expect(north.flips).toBe(true)
  })

  it('reports workable midday light, not a low sun flare situation', () => {
    const { altitude } = getSunPosition(AT_1300, LAT, LON)
    expect(altitudeNote(altitude)).toBe('workable')
  })
})

import { describe, expect, it } from 'vitest'
import {
  clampAltitudeFeet,
  DEFAULT_ALTITUDE_FEET,
  depressionDegrees,
  MAX_ALTITUDE_FEET,
  MIN_ALTITUDE_FEET,
  pilotSeparation,
  slantRangeMeters,
} from './air.ts'
import { classifyFraming, computeFOV, frameWidthMeters, SENSORS } from './fov.ts'
import { destinationPoint } from './geo.ts'
import { feetToMeters } from './reachScale.ts'

const BREW_RIVER = { lat: 38.364236, lon: -75.605912 }
/** The Air 3S wide camera, 24mm equivalent, as the shipped kit has it. */
const AIR_3S_WIDE = computeFOV(24, SENSORS.fullFrame)

describe('altitude is clamped, because the field is a field', () => {
  it('defaults to a working height', () => {
    expect(DEFAULT_ALTITUDE_FEET).toBe(200)
  })

  /*
   * 400ft is the Part 107 altitude limit and the top of the input. It is NOT a
   * statement that a flight at or under it is permitted.
   */
  it('caps at 400 feet', () => {
    expect(MAX_ALTITUDE_FEET).toBe(400)
    expect(clampAltitudeFeet(1200)).toBe(400)
    expect(clampAltitudeFeet(401)).toBe(400)
    expect(clampAltitudeFeet(400)).toBe(400)
  })

  it('will not let an air position sit on the ground', () => {
    expect(clampAltitudeFeet(0)).toBe(MIN_ALTITUDE_FEET)
    expect(clampAltitudeFeet(-50)).toBe(MIN_ALTITUDE_FEET)
  })

  it('takes whole feet, and survives a half typed field', () => {
    expect(clampAltitudeFeet(217.4)).toBe(217)
    expect(clampAltitudeFeet(Number.NaN)).toBe(DEFAULT_ALTITUDE_FEET)
    expect(clampAltitudeFeet(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ALTITUDE_FEET)
  })
})

/*
 * THE GAP THIS CLOSES, stated as the numbers that were wrong.
 *
 * Every one of these was computed from the horizontal distance alone before,
 * which treated the aircraft as standing on the map.
 */
describe('a camera in the air is not a camera on the ground', () => {
  it('is 61m from a subject it is hovering directly over at 200ft', () => {
    expect(slantRangeMeters(0, 200)).toBeCloseTo(feetToMeters(200), 6)
    expect(slantRangeMeters(0, 200)).toBeCloseTo(60.96, 2)
  })

  it('is the hypotenuse, not the horizontal leg', () => {
    // 200ft is 60.96m, so 25m out is a 65.9m slant.
    expect(slantRangeMeters(25, 200)).toBeCloseTo(65.89, 1)
    expect(slantRangeMeters(150, 200)).toBeCloseTo(161.9, 1)
  })

  it('matters least when the aircraft is far out and most when it is overhead', () => {
    const near = slantRangeMeters(25, 200) / 25
    const far = slantRangeMeters(400, 200) / 400
    expect(near).toBeGreaterThan(2.5)
    expect(far).toBeLessThan(1.02)
  })

  /*
   * And the consequence: a drone over the subject used to report a frame width
   * of zero metres and no warning at all.
   */
  it('reports a real frame width for a position hovering over the subject', () => {
    const wrong = frameWidthMeters(0, AIR_3S_WIDE.hFOV)
    const right = frameWidthMeters(slantRangeMeters(0, 200), AIR_3S_WIDE.hFOV)
    expect(wrong).toBe(0)
    expect(right).toBeCloseTo(91.2, 1)
  })

  /*
   * The slant range matters to the framing judgement, not just to the printed
   * distance: a 13 m subject under a drone at 200 ft is inside the frame four
   * times over, and the old ground-range arithmetic could not see it. The
   * subject size is given, because without one nothing is claimed either way.
   */
  it('warns about a frame the old arithmetic called fine', () => {
    expect(classifyFraming(25, AIR_3S_WIDE.hFOV, 'air', 13)).toEqual([])
    expect(
      classifyFraming(slantRangeMeters(25, 200), AIR_3S_WIDE.hFOV, 'air', 13),
    ).toContain('frame-wider-than-subject')
  })

  /* And with no subject size, neither range is judged at all. */
  it('claims nothing about either frame when the subject size is unknown', () => {
    expect(classifyFraming(25, AIR_3S_WIDE.hFOV, 'air')).toEqual([])
    expect(classifyFraming(slantRangeMeters(25, 200), AIR_3S_WIDE.hFOV, 'air')).toEqual([])
  })

  it('never returns less than the altitude, whatever the horizontal is', () => {
    for (const altitude of [MIN_ALTITUDE_FEET, 50, 200, MAX_ALTITUDE_FEET]) {
      for (const horizontal of [0, 1, 40, 250, 1000]) {
        expect(slantRangeMeters(horizontal, altitude)).toBeGreaterThanOrEqual(
          feetToMeters(altitude) - 1e-9,
        )
        expect(slantRangeMeters(horizontal, altitude)).toBeGreaterThanOrEqual(horizontal - 1e-9)
      }
    }
  })
})

describe('how far down the camera is pointing', () => {
  it('is straight down when the aircraft is over the subject', () => {
    expect(depressionDegrees(0, 200)).toBe(90)
  })

  it('is 45 degrees when the horizontal matches the altitude', () => {
    expect(depressionDegrees(feetToMeters(200), 200)).toBeCloseTo(45, 6)
  })

  it('flattens out as the aircraft moves away', () => {
    expect(depressionDegrees(400, 200)).toBeLessThan(10)
    expect(depressionDegrees(400, 200)).toBeGreaterThan(0)
  })
})

/*
 * THE PILOT LINE IS A MEASUREMENT.
 *
 * Two numbers, because they answer different questions, and neither of them
 * says anything about whether a flight is permitted.
 */
describe('separation between the pilot and the aircraft', () => {
  it('measures the ground distance and the real distance separately', () => {
    const aircraft = destinationPoint(BREW_RIVER, 90, 300)
    const out = pilotSeparation(BREW_RIVER, aircraft, 400)
    expect(out.horizontalMeters).toBeCloseTo(300, 0)
    // 400ft is 121.9m straight up, so the hypotenuse is a bit over 323m.
    expect(out.slantMeters).toBeCloseTo(323.8, 0)
    expect(out.slantMeters).toBeGreaterThan(out.horizontalMeters)
  })

  it('is the altitude alone when the pilot is standing underneath', () => {
    const out = pilotSeparation(BREW_RIVER, BREW_RIVER, 400)
    expect(out.horizontalMeters).toBeCloseTo(0, 6)
    expect(out.slantMeters).toBeCloseTo(121.9, 1)
  })

  it('reports the altitude it actually used, clamped', () => {
    expect(pilotSeparation(BREW_RIVER, BREW_RIVER, 2000).altitudeFeet).toBe(MAX_ALTITUDE_FEET)
  })
})

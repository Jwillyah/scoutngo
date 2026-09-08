import { describe, expect, it } from 'vitest'
import { altitudeNote, classifyLighting, evaluateWindow } from './lighting.ts'

// positionBearing is FROM the venue TO the camera. cameraBearing is the reciprocal.
const fromCameraBearing = (cameraBearing: number) => (cameraBearing + 180) % 360

describe('classifyLighting', () => {
  it('THE PROTOTYPE FAILURE: camera pointing 135 with the sun at 134 is backlit', () => {
    // The prototype put a camera northwest of the venue, pointing southeast at 135,
    // sun at 134, and called it "sun behind camera, front-lit". It is the opposite.
    const result = classifyLighting(fromCameraBearing(135), 134)
    expect(result.cameraBearing).toBeCloseTo(135, 10)
    expect(result.delta).toBeCloseTo(1, 10)
    expect(result.classification).toBe('backlit')
  })

  it('camera south of the venue with the sun due south is front-lit', () => {
    const result = classifyLighting(180, 180)
    expect(result.cameraBearing).toBeCloseTo(0, 10)
    expect(result.delta).toBeCloseTo(180, 10)
    expect(result.classification).toBe('front-lit')
  })

  it('camera north of the venue with the sun due south is backlit', () => {
    const result = classifyLighting(0, 180)
    expect(result.cameraBearing).toBeCloseTo(180, 10)
    expect(result.delta).toBeCloseTo(0, 10)
    expect(result.classification).toBe('backlit')
  })

  it('wraps around north: camera pointing 350 with the sun at 10 is delta 20, backlit', () => {
    const result = classifyLighting(fromCameraBearing(350), 10)
    expect(result.cameraBearing).toBeCloseTo(350, 10)
    expect(result.delta).toBeCloseTo(20, 10)
    expect(result.classification).toBe('backlit')
  })

  it('classifies the middle band as side-lit', () => {
    expect(classifyLighting(fromCameraBearing(90), 180).classification).toBe('side-lit')
    expect(classifyLighting(fromCameraBearing(180), 90).classification).toBe('side-lit')
  })

  it('holds the boundaries: 45 is side-lit, 135 is side-lit', () => {
    expect(classifyLighting(fromCameraBearing(45), 0).delta).toBeCloseTo(45, 10)
    expect(classifyLighting(fromCameraBearing(45), 0).classification).toBe('side-lit')
    expect(classifyLighting(fromCameraBearing(135), 0).delta).toBeCloseTo(135, 10)
    expect(classifyLighting(fromCameraBearing(135), 0).classification).toBe('side-lit')
  })

  it('never reports a delta outside 0 to 180', () => {
    for (let position = 0; position < 360; position += 7) {
      for (let sun = 0; sun < 360; sun += 11) {
        const { delta } = classifyLighting(position, sun)
        expect(delta).toBeGreaterThanOrEqual(0)
        expect(delta).toBeLessThanOrEqual(180)
      }
    }
  })

  it('handles unnormalised inputs', () => {
    expect(classifyLighting(-45, 400).classification).toBe(
      classifyLighting(315, 40).classification,
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
    const w = evaluateWindow(0, BREW_RIVER.lat, BREW_RIVER.lon, start, end)
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
      180,
      BREW_RIVER.lat,
      BREW_RIVER.lon,
      new Date('2026-09-12T12:30:00-04:00'),
      new Date('2026-09-12T13:30:00-04:00'),
    )
    expect(w.start.lighting.classification).toBe('front-lit')
    expect(w.middle.lighting.classification).toBe('front-lit')
    expect(w.end.lighting.classification).toBe('front-lit')
    expect(w.flips).toBe(false)
  })

  it('reports flips=true when a long window changes the answer', () => {
    // Camera due east of the venue looks west; the sun crosses from behind it to in front.
    const dawnToDusk = evaluateWindow(
      90,
      BREW_RIVER.lat,
      BREW_RIVER.lon,
      new Date('2026-09-12T08:00:00-04:00'),
      new Date('2026-09-12T18:00:00-04:00'),
    )
    expect(dawnToDusk.start.lighting.classification).not.toBe(dawnToDusk.end.lighting.classification)
    expect(dawnToDusk.flips).toBe(true)
  })

  it('carries the altitude note for each sample', () => {
    const w = evaluateWindow(180, BREW_RIVER.lat, BREW_RIVER.lon, start, end)
    expect(w.middle.altitudeNote).toBe('workable')
    expect(w.middle.sun.altitude).toBeGreaterThan(15)
  })
})

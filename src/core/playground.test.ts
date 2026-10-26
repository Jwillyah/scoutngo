import { describe, expect, it } from 'vitest'
import { brightnessFactor, ev100, meterReading } from './exposure.ts'
import {
  addedBlur,
  addedGrain,
  backgroundDiscPx,
  motionStreakPx,
  playgroundFrame,
  PRESETS,
  REFERENCE,
  REFERENCE_DISC_PX,
  REFERENCE_STREAK_PX,
  SCENE_EV,
  subjectDistanceMeters,
  surferBox,
} from './playground.ts'

describe('exposure value', () => {
  it('is the definition: f/1 at 1 s and ISO 100 is EV 0, and each doubling is one stop', () => {
    expect(ev100(1, 1, 100)).toBe(0)
    expect(ev100(1 / 2, 1, 100)).toBeCloseTo(1, 10)
    expect(ev100(1, 1, 200)).toBeCloseTo(-1, 10)
    expect(ev100(1 / 125, 16, 100)).toBeCloseTo(15, 0)
  })

  it('the photo as shot, 1/1600 f/7.1 ISO 200, is EV100 15.3: bright sun', () => {
    expect(SCENE_EV).toBeCloseTo(15.3, 1)
  })

  it('the meter reads right within two thirds of a stop, and brightness follows gamma', () => {
    expect(meterReading(0.6)).toBe('right')
    expect(meterReading(0.7)).toBe('too bright')
    expect(meterReading(-0.7)).toBe('too dark')
    expect(brightnessFactor(0)).toBe(1)
    expect(brightnessFactor(2.2)).toBeCloseTo(2, 10)
  })
})

describe('the playground, from the photo outwards', () => {
  it('at the photo\'s own settings shows the photo: no added blur, grain or brightness', () => {
    const f = playgroundFrame({ seconds: REFERENCE.seconds, aperture: REFERENCE.aperture, iso: REFERENCE.iso }, REFERENCE.focalMm, REFERENCE.sensor)
    expect(f.reading).toBe('right')
    expect(f.brightness).toBeCloseTo(1, 10)
    expect(f.motionSigmaPx).toBe(0)
    expect(f.backgroundSigmaPx).toBe(0)
    expect(f.grain).toBe(0)
  })

  it('places him about 53 m away at 281 mm, and nearer on a shorter lens framed the same', () => {
    expect(subjectDistanceMeters(281, 'fullFrame')).toBeCloseTo(53.3, 1)
    expect(subjectDistanceMeters(200, 'fullFrame')).toBeCloseTo(53.3 * (200 / 281), 1)
  })

  it('a slower shutter smears him further, in proportion', () => {
    expect(motionStreakPx(1 / 125) / REFERENCE_STREAK_PX).toBeCloseTo(1600 / 125, 6)
  })

  it('the 70-200 at f/2.8 throws the crowd softer than the photo, f/22 cannot sharpen it', () => {
    expect(backgroundDiscPx(200, 2.8, 'fullFrame')).toBeGreaterThan(REFERENCE_DISC_PX)
    expect(addedBlur(backgroundDiscPx(200, 22, 'fullFrame'), REFERENCE_DISC_PX)).toBe(0)
  })

  it('grain is added only above the photo\'s own ISO, and grows with it', () => {
    expect(addedGrain(100)).toBe(0)
    expect(addedGrain(200)).toBe(0)
    expect(addedGrain(6400)).toBeGreaterThan(addedGrain(800))
  })

  it('every preset is dialled right for its light', () => {
    expect(PRESETS.map((p) => p.label)).toEqual(['Freeze the air', 'Golden hour', 'Show the spray', 'Night pool'])
    for (const p of PRESETS) expect(playgroundFrame(p.settings, 200, 'fullFrame', p.light).reading, p.label).toBe('right')
    expect(PRESETS.find((p) => p.id === 'freeze')?.settings.seconds).toBe(1 / 2000)
  })

  it('the cutout lies where it was cut from, in the original frame', () => {
    const b = surferBox()
    expect(b.x).toBeCloseTo(546.5, 0)
    expect(b.y).toBeCloseTo(582.2, 0)
  })
})

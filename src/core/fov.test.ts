import { describe, expect, it } from 'vitest'
import {
  classifyFraming,
  computeFOV,
  frameWidthMeters,
  PRACTICAL_MAX_STANDOFF_METERS,
  rangeForFrameWidth,
  SENSORS,
  standoffBand,
  framingJudgementApplies,
  frameSubjectRatio,
  USABLE_FRAME_WIDTH_METERS,
  WIDE_FRAME_RATIO,
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

  /*
   * THE COMPARISON NEEDS A SUBJECT SIZE AND SAYS NOTHING WITHOUT ONE.
   *
   * This is the reported bug, as an assertion. A 28mm at 300 m frames about
   * 385 m across. Whether that is too wide depends entirely on how big the
   * thing in the middle is, and the app only knows that if it is told. Told
   * nothing, it says nothing; told 13 m, it says the frame is 30 times it.
   */
  it('says nothing about a wide frame when the subject size is unknown', () => {
    expect(classifyFraming(300, hFOV(28), 'ground')).toEqual([])
    expect(classifyFraming(300, hFOV(28), 'ground', null)).toEqual([])
  })

  it('flags a wide lens standing much too far back from a small subject', () => {
    expect(classifyFraming(300, hFOV(28), 'ground', 13)).toContain('frame-wider-than-subject')
  })

  /*
   * AND THE SAME GEOMETRY IS FINE FOR A BIG SUBJECT. 385 m of frame on a 200 m
   * marina is under twice its width, which is a shot, not a mistake. This is
   * the pair that the flat 60 m threshold could not tell apart.
   */
  it('says nothing about the same frame when the subject is large', () => {
    expect(classifyFraming(300, hFOV(28), 'ground', 200)).toEqual([])
  })

  /*
   * WIDE IS THE NORMAL STATE OF AN AERIAL. The ratio quietened most of these;
   * the right answer for an aircraft turned out to be silence. See
   * framingJudgementApplies and the block of tests at the end of this file.
   */
  it('says nothing about an aerial however wide the frame is', () => {
    expect(classifyFraming(150, hFOV(24), 'air', 200)).toEqual([])
    expect(classifyFraming(150, hFOV(24), 'air', 13)).toEqual([])
    expect(classifyFraming(150, hFOV(24), 'ground', 200)).toEqual([])
    /* The same geometry on the ground, against the same small subject, does. */
    expect(classifyFraming(150, hFOV(24), 'ground', 13)).toContain('frame-wider-than-subject')
  })

  /* The ratio is exactly WIDE_FRAME_RATIO at the boundary, and exclusive. */
  it('fires above the ratio, not at it', () => {
    const range = 300
    const width = frameWidthMeters(range, hFOV(28))
    expect(classifyFraming(range, hFOV(28), 'ground', width / WIDE_FRAME_RATIO)).toEqual([])
    expect(
      classifyFraming(range, hFOV(28), 'ground', width / WIDE_FRAME_RATIO - 0.01),
    ).toContain('frame-wider-than-subject')
  })

  describe('frameSubjectRatio states the multiple', () => {
    it('divides the frame by the subject', () => {
      expect(frameSubjectRatio(90, 30)).toBeCloseTo(3, 6)
    })

    /* Null in, null out. Never a zero or a one standing in for unknown. */
    it('is null with no subject size', () => {
      expect(frameSubjectRatio(90, null)).toBeNull()
      expect(frameSubjectRatio(90, 0)).toBeNull()
      expect(frameSubjectRatio(90, -5)).toBeNull()
      expect(frameSubjectRatio(0, 30)).toBeNull()
    })
  })

  it('flags a long lens beyond the practical standoff even when the frame is tight', () => {
    /*
     * A 600mm at 800 m frames about 54 m. Against a 30 m subject that is 1.8
     * times, which is a tight frame, and the only thing wrong with the
     * position is the distance itself: haze, shimmer, no separation. Those do
     * not care how big the subject is, which is why beyond-standoff stayed a
     * flat distance when the framing judgement became a ratio.
     */
    const warnings = classifyFraming(800, hFOV(600), 'ground', 30)
    expect(frameWidthMeters(800, hFOV(600))).toBeLessThan(30 * WIDE_FRAME_RATIO)
    expect(warnings).toContain('beyond-standoff')
    expect(warnings).not.toContain('frame-wider-than-subject')
  })

  /*
   * Deliberately NOT flagged. Seventy percent of this shooter's ground time is on
   * long glass, and a two metre frame at four hundred metres is the 600mm doing
   * its job. Flagging it would cry wolf on the most common correct position.
   */
  it('says nothing about a very tight frame from long glass', () => {
    expect(classifyFraming(400, hFOV(600), 'ground', 13)).toEqual([])
  })

  it('says nothing about a position sitting on the subject', () => {
    expect(classifyFraming(0, hFOV(28), 'ground', 13)).toEqual([])
  })
})

/*
 * ITEM 3: WIDE IS THE INTENT, NOT A PROBLEM, FOR EVERYTHING BUT A GROUND
 * FRAMED SHOT.
 *
 * Reported after the ratio landed: "Better than yesterday, it fired on two of
 * three instead of all three. But those are aerials. Wide is what I flew for."
 */
describe('the wide frame judgement only applies to a ground framed shot', () => {
  const hFOV = (focal: number) => computeFOV(focal, SENSORS.fullFrame).hFOV
  /* A frame 30 times the subject: as wide as it gets, so nothing is marginal. */
  const wide = (platform: 'ground' | 'air', shotType: 'framed' | 'top-down' | 'orbit') =>
    classifyFraming(300, hFOV(28), platform, 13, shotType)

  it('fires on a ground framed shot, which is the one case it helps', () => {
    expect(wide('ground', 'framed')).toContain('frame-wider-than-subject')
  })

  it('says nothing on an air position, whatever the numbers are', () => {
    expect(wide('air', 'framed')).not.toContain('frame-wider-than-subject')
  })

  it('says nothing on a top-down, where the frame is the composition', () => {
    expect(wide('ground', 'top-down')).not.toContain('frame-wider-than-subject')
    expect(wide('air', 'top-down')).not.toContain('frame-wider-than-subject')
  })

  it('says nothing on a 360, which has no frame to be wide', () => {
    expect(wide('ground', 'orbit')).not.toContain('frame-wider-than-subject')
    expect(wide('air', 'orbit')).not.toContain('frame-wider-than-subject')
  })

  /*
   * THE DISTANCE WARNING IS UNTOUCHED. An aircraft 600 m out is out of sight
   * whatever it is pointing at, and that has nothing to do with framing.
   */
  it('still reports a position beyond the practical standoff in the air', () => {
    expect(classifyFraming(600, hFOV(24), 'air', 13, 'framed')).toContain('beyond-standoff')
    expect(classifyFraming(600, hFOV(24), 'air', 13, 'orbit')).toContain('beyond-standoff')
  })

  it('states the rule in one place', () => {
    expect(framingJudgementApplies('ground', 'framed')).toBe(true)
    for (const [platform, shotType] of [
      ['air', 'framed'],
      ['ground', 'top-down'],
      ['ground', 'orbit'],
      ['air', 'top-down'],
      ['air', 'orbit'],
    ] as const) {
      expect(framingJudgementApplies(platform, shotType), `${platform}/${shotType}`).toBe(false)
    }
  })

  /*
   * AND THE MEASUREMENT SURVIVES. Suppressing the judgement must not suppress
   * the frame width, which is a fact and is useful on an aerial.
   */
  it('still measures the frame for the shots it says nothing about', () => {
    expect(frameWidthMeters(300, hFOV(28))).toBeGreaterThan(300)
  })
})

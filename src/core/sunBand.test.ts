import { describe, expect, it } from 'vitest'
import {
  BAND_UPPER_BOUND,
  bandsAcross,
  unlitGroundShare,
  groundSubjectHasDirectLight,
  skyCarriesTheShot,
  SUN_BAND_LABEL,
  SUN_BAND_NOTE,
  sunBand,
  type SunBand,
} from './sunBand.ts'

const ALL: SunBand[] = [
  'flat-overhead',
  'open',
  'late-golden',
  'horizon',
  'afterglow',
  'blue-hour',
  'nautical',
  'night',
]

/*
 * THE BANDS THAT WERE ASKED FOR, pinned to the numbers they were asked with.
 */
describe('the bands', () => {
  it('puts +6 to 0 in late golden', () => {
    expect(sunBand(6)).toBe('late-golden')
    expect(sunBand(3)).toBe('late-golden')
    expect(sunBand(1)).toBe('late-golden')
  })

  it('puts the horizon crossing in its own band', () => {
    expect(sunBand(0)).toBe('horizon')
    expect(sunBand(0.4)).toBe('horizon')
    expect(sunBand(-0.4)).toBe('horizon')
  })

  it('puts 0 to -4 in afterglow', () => {
    expect(sunBand(-1)).toBe('afterglow')
    expect(sunBand(-3.6)).toBe('afterglow')
    expect(sunBand(-4)).toBe('blue-hour')
  })

  it('puts -4 to -6 in blue hour peak', () => {
    expect(sunBand(-4.5)).toBe('blue-hour')
    expect(sunBand(-6)).toBe('nautical')
  })

  it('puts -6 to -12 in nautical', () => {
    expect(sunBand(-6.5)).toBe('nautical')
    expect(sunBand(-9.6)).toBe('nautical')
    expect(sunBand(-12)).toBe('night')
  })

  it('calls well below -12 night', () => {
    expect(sunBand(-15.5)).toBe('night')
    expect(sunBand(-40)).toBe('night')
  })

  it('keeps the distinction above +6 the old note drew', () => {
    expect(sunBand(30)).toBe('open')
    expect(sunBand(70)).toBe('flat-overhead')
  })
})

/*
 * CONTIGUOUS AND EXHAUSTIVE. A gap would mean an altitude with no band, which
 * is how a readout ends up showing nothing at all.
 */
describe('the bands cover every altitude', () => {
  it('returns a band for every tenth of a degree from +90 to -90', () => {
    for (let a = -90; a <= 90; a += 0.1) {
      const band = sunBand(Number(a.toFixed(1)))
      expect(ALL, `altitude ${a.toFixed(1)}`).toContain(band)
    }
  })

  it('never skips a band as the sun descends', () => {
    const seen: SunBand[] = []
    for (let a = 90; a >= -90; a -= 0.05) {
      const band = sunBand(Number(a.toFixed(2)))
      if (seen[seen.length - 1] !== band) seen.push(band)
    }
    expect(seen).toEqual(ALL)
  })

  it('is ordered highest first, with strictly descending bounds', () => {
    const bounds = BAND_UPPER_BOUND.map((b) => b.above)
    expect(bounds).toEqual([...bounds].sort((x, y) => y - x))
    expect(new Set(bounds).size).toBe(bounds.length)
  })

  it('names and explains every band', () => {
    for (const band of ALL) {
      expect(SUN_BAND_LABEL[band]).toBeTruthy()
      expect(SUN_BAND_NOTE[band].length).toBeGreaterThan(20)
    }
  })

  /*
   * NO BAND IS DESCRIBED AS A PROBLEM. The old line called the whole
   * pre-sunrise stretch "nothing to light a position with", which for a
   * backlit cloud shot is exactly backwards.
   */
  it('describes every band as a state, never as a failure', () => {
    for (const band of ALL) {
      const text = SUN_BAND_NOTE[band].toLowerCase()
      expect(text).not.toContain('nothing to light')
      expect(text).not.toContain('no shot')
      expect(text).not.toContain('too dark to')
      expect(text).not.toContain('unusable')
    }
  })
})

/*
 * THE ONE JUDGEMENT, AND ITS NARROWNESS IS THE POINT.
 */
describe('whether a ground subject has light on its face', () => {
  it('needs the sun above the horizon', () => {
    expect(groundSubjectHasDirectLight(0.5)).toBe(true)
    expect(groundSubjectHasDirectLight(0)).toBe(false)
    expect(groundSubjectHasDirectLight(-4)).toBe(false)
  })

  /*
   * AND IT SAYS NOTHING ABOUT A SKY SUBJECT, which is the whole fix. At every
   * one of these altitudes a face has no light on it AND the sky is still
   * carrying a picture. Both facts at once is what the old single warning
   * could not express.
   */
  it('is not a statement about the sky', () => {
    for (const [altitude, sky] of [
      [-1, true],
      [-4, true],
      [-5, true],
      [-7, false],
      [-10, false],
    ] as const) {
      expect(groundSubjectHasDirectLight(altitude), `altitude ${altitude}`).toBe(false)
      expect(skyCarriesTheShot(sunBand(altitude)), `altitude ${altitude}`).toBe(sky)
    }
  })

  it('names the bands where the sky is carrying the picture', () => {
    expect(skyCarriesTheShot('horizon')).toBe(true)
    expect(skyCarriesTheShot('afterglow')).toBe(true)
    expect(skyCarriesTheShot('blue-hour')).toBe(true)
    expect(skyCarriesTheShot('night')).toBe(false)
    expect(skyCarriesTheShot('open')).toBe(false)
  })
})

/*
 * THE MEASURED WINDOW THAT PROMPTED THIS. Lesner Bridge, 20 Oct 2026, sunrise
 * 07:16 local, re-derived from suncalc and written to
 * measurements/2026-10-18-derivations.md. Every one of these read "nothing to
 * light a position with".
 *
 * The comment said 07:15 before it was checked; suncalc gives 07:16:40 for
 * that date and coordinate. A minute and a half, and wrong is wrong.
 */
describe('the sunrise window at Lesner Bridge', () => {
  it('bands the stretch that used to be called empty', () => {
    expect(sunBand(-15.53)).toBe('night')
    expect(sunBand(-12.54)).toBe('night')
    expect(sunBand(-9.55)).toBe('nautical')
    expect(sunBand(-6.57)).toBe('nautical')
    expect(sunBand(-3.61)).toBe('afterglow')
    expect(sunBand(-0.67)).toBe('afterglow')
    expect(sunBand(2.06)).toBe('late-golden')
    expect(sunBand(4.81)).toBe('late-golden')
  })

  it('finds the sky carrying the shot in the middle of it', () => {
    expect(skyCarriesTheShot(sunBand(-3.61))).toBe(true)
    expect(skyCarriesTheShot(sunBand(-0.67))).toBe(true)
  })
})

/*
 * ACROSS A WINDOW, NOT AT THREE POINTS.
 *
 * The readout shows the start, the middle and the end. Naming the bands from
 * those three misses the ones in between: measured at Lesner Bridge for 18:10
 * to 19:30 on 20 October 2026, the three samples are late golden, nautical and
 * night, so a window passing straight through sunset and afterglow would have
 * mentioned neither.
 */
describe('bandsAcross', () => {
  /** A straight ramp, so the expected bands are arithmetic rather than solar. */
  const ramp = (from: number, to: number, start: Date, end: Date) => (at: Date) => {
    const share = (at.getTime() - start.getTime()) / (end.getTime() - start.getTime())
    return from + (to - from) * share
  }

  const START = new Date('2026-10-20T10:00:00Z')
  const END = new Date('2026-10-20T11:45:00Z')

  it('finds every band a descent passes through, in order', () => {
    const bands = bandsAcross(ramp(20, -20, START, END), START, END)
    expect(bands).toEqual([
      'open',
      'late-golden',
      'horizon',
      'afterglow',
      'blue-hour',
      'nautical',
      'night',
    ])
  })

  it('finds them in the other order on the way up', () => {
    const bands = bandsAcross(ramp(-20, 20, START, END), START, END)
    expect(bands[0]).toBe('night')
    expect(bands[bands.length - 1]).toBe('open')
  })

  /*
   * THE HORIZON BAND IS NARROW, about two to four minutes of clock, and the
   * step has to be fine enough to land in it. This is the assertion that the
   * default step does.
   */
  it('catches the horizon crossing at the default step', () => {
    // A whole day's worth of descent, which is the least favourable case.
    const dayStart = new Date('2026-10-20T10:00:00Z')
    const dayEnd = new Date('2026-10-20T22:00:00Z')
    const bands = bandsAcross(ramp(60, -60, dayStart, dayEnd), dayStart, dayEnd)
    expect(bands).toContain('horizon')
  })

  it('always includes the start and the end, whatever the step', () => {
    const bands = bandsAcross(ramp(20, -20, START, END), START, END, 600)
    expect(bands[0]).toBe('open')
    expect(bands[bands.length - 1]).toBe('night')
  })

  it('returns one band for a window that does not move', () => {
    expect(bandsAcross(() => -5, START, END)).toEqual(['blue-hour'])
  })

  it('returns nothing for a window that makes no sense', () => {
    expect(bandsAcross(() => 10, END, START)).toEqual([])
    expect(bandsAcross(() => 10, new Date(Number.NaN), END)).toEqual([])
  })
})

describe('unlitGroundShare', () => {
  const START = new Date('2026-10-20T10:00:00Z')
  const END = new Date('2026-10-20T11:00:00Z')

  it('is none when the sun is up the whole time', () => {
    expect(unlitGroundShare(() => 20, START, END)).toBe(0)
  })

  it('is all when the sun is down the whole time', () => {
    expect(unlitGroundShare(() => -20, START, END)).toBe(1)
  })

  it('is a share when the window straddles the horizon', () => {
    const half = (at: Date) =>
      at.getTime() < (START.getTime() + END.getTime()) / 2 ? -5 : 5
    const share = unlitGroundShare(half, START, END)
    expect(share).toBeGreaterThan(0.4)
    expect(share).toBeLessThan(0.6)
  })

  /* Measured: the Lesner sunrise window is 75% unlit, the dusk one 88%. */
  it('reports part rather than all for the Lesner sunrise window', () => {
    const start = new Date('2026-10-20T10:00:00Z')
    const end = new Date('2026-10-20T11:45:00Z')
    const ramp = (at: Date) => {
      const share = (at.getTime() - start.getTime()) / (end.getTime() - start.getTime())
      return -15.53 + (4.81 - -15.53) * share
    }
    const share = unlitGroundShare(ramp, start, end)
    expect(share).toBeGreaterThan(0.5)
    expect(share).toBeLessThan(1)
  })
})

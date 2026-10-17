import { describe, expect, it } from 'vitest'
import { getPosition, getTimes } from 'suncalc'
import {
  CIVIL_TWILIGHT_ALTITUDE_DEG,
  HORIZON_ALTITUDE_DEG,
  anticollisionRequired,
  civilTimes,
  nightTrainingRequired,
  phaseAt,
  phaseRequirements,
  phaseSpans,
  type LightPhase,
} from './nightWindow.ts'

/* Sandbridge, which is where the shoot that produced this was. */
const SANDBRIDGE = { lat: 36.726, lon: -75.94 }

describe('the band boundaries are suncalc own event times', () => {
  /*
   * THE BOUNDARY AND THE PRINTED TIME MUST BE THE SAME FACT. If the phase were
   * classified by an altitude threshold it would disagree with the dawn and
   * dusk times shown next to it, because this build's getPosition and getTimes
   * differ by a constant 0.48 degrees. These assertions are what would fail if
   * someone replaced the event lookup with "altitude < -6".
   */
  const times = civilTimes(new Date('2026-10-15T12:00:00Z'), SANDBRIDGE.lat, SANDBRIDGE.lon)

  it('has all four boundaries at this latitude', () => {
    expect(times.dawn).toBeInstanceOf(Date)
    expect(times.sunrise).toBeInstanceOf(Date)
    expect(times.sunset).toBeInstanceOf(Date)
    expect(times.dusk).toBeInstanceOf(Date)
  })

  it('classifies the instant AT each boundary as the phase that boundary starts', () => {
    const at = (d: Date | null) => phaseAt(d as Date, SANDBRIDGE.lat, SANDBRIDGE.lon)
    expect(at(times.sunrise)).toBe('day')
    expect(at(times.sunset)).toBe('civil-twilight')
    expect(at(times.dawn)).toBe('civil-twilight')
    expect(at(times.dusk)).toBe('night')
  })

  it('classifies a second either side of sunset and dusk correctly', () => {
    const step = (d: Date, ms: number) => new Date(d.getTime() + ms)
    const at = (d: Date) => phaseAt(d, SANDBRIDGE.lat, SANDBRIDGE.lon)
    expect(at(step(times.sunset as Date, -1000))).toBe('day')
    expect(at(step(times.sunset as Date, 1000))).toBe('civil-twilight')
    expect(at(step(times.dusk as Date, -1000))).toBe('civil-twilight')
    expect(at(step(times.dusk as Date, 1000))).toBe('night')
  })

  /*
   * The calibrated constants are pinned because they are NOT the nominal -0.833
   * and -6. A suncalc upgrade that moved to radians, or dropped the refraction
   * correction, must fail here rather than quietly shifting every band edge.
   */
  it('pins the altitude this build reports at its own events', () => {
    const alt = (d: Date | null) => getPosition(d as Date, SANDBRIDGE.lat, SANDBRIDGE.lon).altitude
    expect(alt(times.sunset)).toBeCloseTo(HORIZON_ALTITUDE_DEG, 2)
    expect(alt(times.dusk)).toBeCloseTo(CIVIL_TWILIGHT_ALTITUDE_DEG, 2)
    /* And it is degrees, not radians: solar noon is tens, not a fraction. */
    const noon = getTimes(new Date('2026-10-15T12:00:00Z'), SANDBRIDGE.lat, SANDBRIDGE.lon).solarNoon
    expect(alt(noon)).toBeGreaterThan(30)
    expect(alt(noon)).toBeLessThan(60)
  })
})

describe('the shoot this was reported from', () => {
  /*
   * THE REGRESSION. The app reported blue hour peak as 18:44 to 18:53 local and
   * said nothing about lighting. Sunset that evening was 18:27 and dusk 18:53,
   * so the whole window was inside civil twilight and anti-collision lighting
   * applied to every minute of it. This test is that evening.
   */
  const EDT_OFFSET_MS = 4 * 3_600_000
  const local = (hhmm: string) =>
    new Date(new Date(`2026-10-15T${hhmm}:00Z`).getTime() + EDT_OFFSET_MS)

  it('puts the reported blue hour window inside civil twilight', () => {
    for (const minute of ['18:44', '18:48', '18:52']) {
      expect(phaseAt(local(minute), SANDBRIDGE.lat, SANDBRIDGE.lon)).toBe('civil-twilight')
    }
  })

  it('requires anti-collision lighting across that whole window', () => {
    const spans = phaseSpans(local('18:44'), local('18:53'), SANDBRIDGE.lat, SANDBRIDGE.lon)
    expect(spans.length).toBeGreaterThan(0)
    for (const span of spans) {
      expect(anticollisionRequired(span.phase)).toBe(true)
    }
  })

  it('does not require the night training for that window', () => {
    /* 18:44 to 18:52 is before dusk, so 107.65 does not attach. */
    expect(nightTrainingRequired(phaseAt(local('18:50'), SANDBRIDGE.lat, SANDBRIDGE.lon))).toBe(false)
  })

  it('does require the night training a few minutes later', () => {
    expect(phaseAt(local('19:10'), SANDBRIDGE.lat, SANDBRIDGE.lon)).toBe('night')
    expect(nightTrainingRequired('night')).toBe(true)
  })
})

describe('the two requirements have different boundaries', () => {
  /*
   * The easy mistake is collapsing these into "night rules". One starts at
   * sunset and the other at dusk, and getting that wrong misstates both.
   */
  it('lights from sunset, training from dusk', () => {
    expect(anticollisionRequired('day')).toBe(false)
    expect(anticollisionRequired('civil-twilight')).toBe(true)
    expect(anticollisionRequired('night')).toBe(true)

    expect(nightTrainingRequired('day')).toBe(false)
    expect(nightTrainingRequired('civil-twilight')).toBe(false)
    expect(nightTrainingRequired('night')).toBe(true)
  })

  it('states both plainly where they apply', () => {
    const twilight = phaseRequirements('civil-twilight').join(' ')
    expect(twilight).toContain('107.29')
    expect(twilight).toContain('3 statute miles')
    expect(twilight).toContain('never be switched off in flight')
    expect(twilight).not.toContain('107.65')

    const night = phaseRequirements('night').join(' ')
    expect(night).toContain('107.29')
    expect(night).toContain('107.65')

    expect(phaseRequirements('day')).toEqual([])
  })
})

describe('spans cover a window contiguously', () => {
  it('runs day into twilight into night with no gap and no overlap', () => {
    const from = new Date('2026-10-15T20:00:00Z')
    const to = new Date('2026-10-16T02:00:00Z')
    const spans = phaseSpans(from, to, SANDBRIDGE.lat, SANDBRIDGE.lon)

    expect(spans.map((s) => s.phase)).toEqual(['day', 'civil-twilight', 'night'])
    expect(spans[0].start.getTime()).toBe(from.getTime())
    expect(spans[spans.length - 1].end.getTime()).toBe(to.getTime())
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].start.getTime()).toBe(spans[i - 1].end.getTime())
    }
  })

  it('crosses midnight without inventing a phase change', () => {
    /* 23:00 to 01:00 local is night throughout, on both sides of midnight. */
    const from = new Date('2026-10-16T03:00:00Z')
    const to = new Date('2026-10-16T05:00:00Z')
    const spans = phaseSpans(from, to, SANDBRIDGE.lat, SANDBRIDGE.lon)
    expect(spans).toHaveLength(1)
    expect(spans[0].phase).toBe('night')
  })

  it('is empty for a backwards or unusable window', () => {
    const a = new Date('2026-10-15T20:00:00Z')
    const b = new Date('2026-10-15T18:00:00Z')
    expect(phaseSpans(a, b, SANDBRIDGE.lat, SANDBRIDGE.lon)).toEqual([])
    expect(phaseSpans(new Date(Number.NaN), a, SANDBRIDGE.lat, SANDBRIDGE.lon)).toEqual([])
  })
})

describe('the polar case, where there are no events to take', () => {
  /*
   * Above the Arctic circle in midsummer suncalc returns null for all four
   * boundaries, because the sun never gets six degrees down. There is still a
   * correct answer. Before the altitude fallback this returned whatever the
   * loop happened to leave behind.
   */
  const BARROW = { lat: 71.0, lon: -156.0 }

  it('has no boundaries at all there', () => {
    const times = civilTimes(new Date('2026-06-21T12:00:00Z'), BARROW.lat, BARROW.lon)
    expect(times.dawn).toBeNull()
    expect(times.sunrise).toBeNull()
    expect(times.sunset).toBeNull()
    expect(times.dusk).toBeNull()
  })

  it('still answers day through the midnight sun', () => {
    for (const hour of ['00:00', '06:00', '12:00', '18:00']) {
      const at = new Date(`2026-06-21T${hour}:00Z`)
      expect(phaseAt(at, BARROW.lat, BARROW.lon)).toBe('day')
    }
  })

  it('answers night through the polar winter', () => {
    expect(phaseAt(new Date('2026-12-21T12:00:00Z'), BARROW.lat, BARROW.lon)).toBe('night')
  })
})

/*
 * THE WORDING. Same rule as the Part 107 altitude card: state the regulation
 * and the computed boundary, never a verdict on this flight. Checked on the
 * strings this module actually produces.
 */
describe('the night wording states no legal conclusion', () => {
  const BANNED = [
    'cleared',
    'compliant',
    'compliance',
    'legal',
    'illegal',
    'lawful',
    'unlawful',
    'permitted',
    'you may fly',
    'safe to fly',
    'ok to fly',
    'allowed to fly',
    'you can fly',
    'no restrictions',
    'free to fly',
    'good to go',
    'violation',
  ]

  const PHASES: LightPhase[] = ['day', 'civil-twilight', 'night']

  it('says nothing conclusive in any phase', () => {
    for (const phase of PHASES) {
      const shown = phaseRequirements(phase).join(' ').toLowerCase()
      for (const phrase of BANNED) {
        expect(shown, `${phase} requirements contain "${phrase}"`).not.toContain(phrase)
      }
    }
  })

  /* The check has to be able to fail, or it passes on every input forever. */
  it('would catch a verdict if one were written', () => {
    const bad = 'This flight is cleared and compliant, you may fly.'.toLowerCase()
    expect(BANNED.some((phrase) => bad.includes(phrase))).toBe(true)
  })
})

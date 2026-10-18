import { describe, expect, it } from 'vitest'
import { getMoonPosition, getPosition } from 'suncalc'
import {
  cloudForWindow,
  horizonAngleAt,
  skyDarknessAt,
  skyWindow,
  windowMinutes,
  type HorizonSample,
} from './skyWindow.ts'

/** Little Devils Stairs Overlook, Shenandoah, resolved through Nominatim. */
const OVERLOOK = { lat: 38.7567229, lon: -78.2675403 }

/** The evening of the 2026 Orionid maximum. */
const ORIONID_EVENING = new Date('2026-10-21T18:00:00-04:00')

const ORIONIDS = { kind: 'meteors', shower: 'orionids' } as const

const hhmm = (at: Date): string =>
  at.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })

describe('the suncalc build this depends on', () => {
  /*
   * PINNED, because every altitude in this file is compared against a horizon
   * angle in DEGREES. A suncalc that returned radians would make every
   * altitude about 57 times too small, every target permanently below every
   * ridge, and every window empty -- which would look like a quiet data
   * problem rather than a unit error.
   */
  it('reports sun and moon altitude in degrees, not radians', () => {
    const at = new Date('2026-10-22T02:00:00Z')
    const sun = getPosition(at, OVERLOOK.lat, OVERLOOK.lon).altitude
    const moon = getMoonPosition(at, OVERLOOK.lat, OVERLOOK.lon).altitude
    expect(Math.abs(sun)).toBeGreaterThan(Math.PI / 2)
    expect(Math.abs(moon)).toBeGreaterThan(Math.PI / 2)
    expect(Math.abs(sun)).toBeLessThanOrEqual(90)
    expect(Math.abs(moon)).toBeLessThanOrEqual(90)
  })
})

describe('the terrain horizon', () => {
  const samples: HorizonSample[] = [
    { azimuth: 0, angleDegrees: 1 },
    { azimuth: 90, angleDegrees: 12 },
    { azimuth: 180, angleDegrees: 3 },
    { azimuth: 270, angleDegrees: 8 },
  ]

  it('takes the nearest measured direction rather than interpolating', () => {
    expect(horizonAngleAt({ kind: 'terrain', samples }, 80)).toBe(12)
    expect(horizonAngleAt({ kind: 'terrain', samples }, 100)).toBe(12)
    /* Exactly between two samples it still picks one real sample, never a mean. */
    const between = horizonAngleAt({ kind: 'terrain', samples }, 135)
    expect([12, 3]).toContain(between)
  })

  it('wraps around north instead of falling off the end', () => {
    expect(horizonAngleAt({ kind: 'terrain', samples }, 350)).toBe(1)
    expect(horizonAngleAt({ kind: 'terrain', samples }, 365)).toBe(1)
  })

  it('is zero everywhere on a flat horizon', () => {
    for (const azimuth of [0, 45, 123, 270, 359]) {
      expect(horizonAngleAt({ kind: 'flat' }, azimuth)).toBe(0)
    }
  })

  it('keeps a negative angle, because from a summit the land falls away', () => {
    const summit: HorizonSample[] = [{ azimuth: 0, angleDegrees: -4 }]
    expect(horizonAngleAt({ kind: 'terrain', samples: summit }, 10)).toBe(-4)
  })
})

describe('the Orionid window at the overlook, flat horizon', () => {
  const result = skyWindow({
    target: ORIONIDS,
    at: OVERLOOK,
    eveningOf: ORIONID_EVENING,
    horizon: { kind: 'flat' },
  })

  it('finds a window on the peak night', () => {
    expect(result.kind).toBe('window')
  })

  it('is bounded by moonset at the start and the brightening sky at the end', () => {
    if (result.kind !== 'window') throw new Error(result.reason)
    /*
     * The 2026 Orionid maximum runs into a waxing gibbous moon, so the window
     * is NOT the whole night: it opens when the moon goes down. That is the
     * binding-constraint report doing its job, and it is the reason this
     * assertion is here rather than a bare duration.
     */
    expect(result.startsBecause).toBe('moon')
    expect(result.endsBecause).toBe('dark')
  })

  it('opens at moonset and closes at astronomical dawn, to the minute', () => {
    if (result.kind !== 'window') throw new Error(result.reason)
    expect(hhmm(result.window.start)).toBe('03:31')
    expect(hhmm(result.window.end)).toBe('06:00')
    expect(windowMinutes(result.window)).toBe(149)
  })

  it('reports every constraint separately, not just the intersection', () => {
    if (result.kind !== 'window') throw new Error(result.reason)
    expect(hhmm(result.constraints.astronomicalDark?.start ?? new Date(0))).toBe('19:55')
    expect(hhmm(result.constraints.targetUp?.start ?? new Date(0))).toBe('22:38')
    expect(hhmm(result.constraints.moonDown?.start ?? new Date(0))).toBe('03:31')
  })

  it('puts the radiant high in the middle of the window', () => {
    if (result.kind !== 'window') throw new Error(result.reason)
    expect(result.altitudeAtMidWindow).toBeGreaterThan(60)
  })

  it('says the horizon was flat', () => {
    expect(result.kind === 'window' && result.horizonSource).toBe('flat')
  })
})

describe('the terrain horizon changes the answer and says that it did', () => {
  /*
   * A ridge to the east, which is where the Orionid radiant rises. The point
   * of the whole feature is that this moves the time and the app says so.
   */
  const ridge: HorizonSample[] = Array.from({ length: 24 }, (_, i) => ({
    azimuth: i * 15,
    angleDegrees: i * 15 >= 45 && i * 15 <= 135 ? 14 : 2,
  }))

  const flat = skyWindow({
    target: ORIONIDS,
    at: OVERLOOK,
    eveningOf: ORIONID_EVENING,
    horizon: { kind: 'flat' },
  })
  const terrain = skyWindow({
    target: ORIONIDS,
    at: OVERLOOK,
    eveningOf: ORIONID_EVENING,
    horizon: { kind: 'terrain', samples: ridge },
  })

  it('labels the two answers differently', () => {
    expect(flat.kind === 'window' && flat.horizonSource).toBe('flat')
    expect(terrain.kind === 'window' && terrain.horizonSource).toBe('terrain')
  })

  it('makes the radiant clear the horizon later over a ridge', () => {
    if (flat.kind !== 'window' || terrain.kind !== 'window') throw new Error('no window')
    const flatUp = flat.constraints.targetUp?.start.getTime() ?? 0
    const ridgeUp = terrain.constraints.targetUp?.start.getTime() ?? 0
    expect(ridgeUp).toBeGreaterThan(flatUp)
  })
})

describe('a reason, never a guess', () => {
  it('refuses to compute without a venue', () => {
    const got = skyWindow({
      target: ORIONIDS,
      at: null,
      eveningOf: ORIONID_EVENING,
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('unknown')
    expect(got.kind === 'unknown' && got.reason).toMatch(/venue/i)
  })

  it('refuses an unusable date', () => {
    const got = skyWindow({
      target: ORIONIDS,
      at: OVERLOOK,
      eveningOf: new Date('not a date'),
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('unknown')
  })

  it('refuses a venue that is not a number', () => {
    const got = skyWindow({
      target: ORIONIDS,
      at: { lat: Number.NaN, lon: -78 },
      eveningOf: ORIONID_EVENING,
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('unknown')
  })

  it('refuses a shower that is not in the table', () => {
    const got = skyWindow({
      target: { kind: 'meteors', shower: 'not-a-shower' as never },
      at: OVERLOOK,
      eveningOf: ORIONID_EVENING,
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('unknown')
    expect(got.kind === 'unknown' && got.reason).toMatch(/shower/i)
  })

  it('NEVER silently falls back to flat when terrain was asked for and is empty', () => {
    const got = skyWindow({
      target: ORIONIDS,
      at: OVERLOOK,
      eveningOf: ORIONID_EVENING,
      horizon: { kind: 'terrain', samples: [] },
    })
    expect(got.kind).toBe('unknown')
    if (got.kind !== 'unknown') return
    expect(got.reason).toMatch(/terrain/i)
    /* And it did not quietly answer with a flat horizon wearing a label. */
    expect(JSON.stringify(got)).not.toContain('"horizonSource":"flat"')
  })

  it('says so where the sun never gets 18 degrees down', () => {
    /* Svalbard in June: no astronomical dark at all. */
    const got = skyWindow({
      target: ORIONIDS,
      at: { lat: 78.22, lon: 15.63 },
      eveningOf: new Date('2026-06-21T18:00:00Z'),
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('none')
    expect(got.kind === 'none' && got.reason).toMatch(/18 degrees/i)
  })

  it('says so when the target never clears the horizon', () => {
    /*
     * The galactic core sits at dec -28.94, so from Tromso at 69.6 N its
     * highest possible altitude is about -8.6 degrees: it never rises, ever.
     * Tromso in late October does get astronomically dark, so the TARGET is
     * the binding constraint here and not the sun.
     *
     * A first draft of this test used the Orionid radiant from latitude -85 in
     * October and asserted the same thing. It failed, and the code was right:
     * that is polar day, so the sun constraint binds first and the module said
     * so. The test was moved rather than the message.
     */
    const got = skyWindow({
      target: { kind: 'milkyway' },
      at: { lat: 69.649, lon: 18.955 },
      eveningOf: new Date('2026-10-21T18:00:00Z'),
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('none')
    if (got.kind !== 'none') return
    expect(got.reason).toMatch(/never clears the horizon|never up/i)
    expect(got.constraints.targetUp).toBeNull()
  })
})

describe('the moon target does not wait for the moon to set', () => {
  const got = skyWindow({
    target: { kind: 'moon' },
    at: OVERLOOK,
    eveningOf: ORIONID_EVENING,
    horizon: { kind: 'flat' },
  })

  it('finds a window while the moon is up', () => {
    expect(got.kind).toBe('window')
  })

  it('does not carry a moon-down constraint at all', () => {
    if (got.kind !== 'window') throw new Error('no window')
    expect(got.constraints.moonDown).toBeNull()
    expect(got.startsBecause).not.toBe('moon')
    expect(got.endsBecause).not.toBe('moon')
  })
})

describe('the milky way core', () => {
  it('is below the horizon all night from Virginia in late October', () => {
    /*
     * The core is a summer target in the northern hemisphere. In late October
     * it sets with the sun, so the honest answer is no window, with a reason.
     */
    const got = skyWindow({
      target: { kind: 'milkyway' },
      at: OVERLOOK,
      eveningOf: ORIONID_EVENING,
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('none')
  })

  it('has a window from Virginia in July, when the core is a summer target', () => {
    const got = skyWindow({
      target: { kind: 'milkyway' },
      at: OVERLOOK,
      eveningOf: new Date('2026-07-10T18:00:00-04:00'),
      horizon: { kind: 'flat' },
    })
    expect(got.kind).toBe('window')
  })
})

describe('cloud over a window', () => {
  const window = {
    start: new Date('2026-10-22T07:31:00Z'),
    end: new Date('2026-10-22T10:00:00Z'),
  }

  it('returns the hours that cover the window', () => {
    const forecast = [
      { at: new Date('2026-10-22T07:00:00Z'), totalPercent: 20 },
      { at: new Date('2026-10-22T08:00:00Z'), totalPercent: 40 },
      { at: new Date('2026-10-22T09:00:00Z'), totalPercent: null },
    ]
    const got = cloudForWindow(forecast, window)
    expect(got.kind).toBe('hours')
    expect(got.kind === 'hours' && got.hours).toHaveLength(3)
  })

  it('says the forecast does not reach, rather than reporting clear', () => {
    const got = cloudForWindow([], window)
    expect(got.kind).toBe('out-of-range')
    if (got.kind !== 'out-of-range') return
    expect(got.reason).toMatch(/does not reach/i)
    expect(got.reason).not.toMatch(/\bclear\b/i)
  })

  it('says so for a forecast that stops before the night', () => {
    const forecast = [{ at: new Date('2026-10-18T09:00:00Z'), totalPercent: 0 }]
    expect(cloudForWindow(forecast, window).kind).toBe('out-of-range')
  })

  it('keeps a null percentage as null rather than turning it into zero', () => {
    const forecast = [{ at: new Date('2026-10-22T08:00:00Z'), totalPercent: null }]
    const got = cloudForWindow(forecast, window)
    if (got.kind !== 'hours') throw new Error('expected hours')
    expect(got.hours[0]?.totalPercent).toBeNull()
  })
})

describe('the sky darkness bucket', () => {
  it('is twilight before astronomical dark', () => {
    expect(skyDarknessAt(new Date('2026-10-21T23:00:00Z'), OVERLOOK.lat, OVERLOOK.lon)).toBe(
      'twilight',
    )
  })

  it('is moonlit while the moon is up in the dark', () => {
    /* 01:00 EDT on the 22nd: dark, moon still up. */
    expect(skyDarknessAt(new Date('2026-10-22T05:00:00Z'), OVERLOOK.lat, OVERLOOK.lon)).toBe(
      'moonlit',
    )
  })

  it('is astro-dark after moonset', () => {
    /* 04:30 EDT on the 22nd: dark, moon down. */
    expect(skyDarknessAt(new Date('2026-10-22T08:30:00Z'), OVERLOOK.lat, OVERLOOK.lon)).toBe(
      'astro-dark',
    )
  })
})

describe('what this module is never allowed to say', () => {
  const forbidden = /\bclear\b|\bsafe\b|\bguaranteed\b|\bperfect night\b/i

  it('never calls a night clear, in any reason it can produce', () => {
    const results = [
      skyWindow({ target: ORIONIDS, at: null, eveningOf: ORIONID_EVENING, horizon: { kind: 'flat' } }),
      skyWindow({
        target: ORIONIDS,
        at: { lat: 78.22, lon: 15.63 },
        eveningOf: new Date('2026-06-21T18:00:00Z'),
        horizon: { kind: 'flat' },
      }),
      skyWindow({
        target: { kind: 'milkyway' },
        at: { lat: 69.649, lon: 18.955 },
        eveningOf: new Date('2026-10-21T18:00:00Z'),
        horizon: { kind: 'flat' },
      }),
      skyWindow({
        target: ORIONIDS,
        at: OVERLOOK,
        eveningOf: ORIONID_EVENING,
        horizon: { kind: 'terrain', samples: [] },
      }),
    ]
    for (const result of results) {
      const text = result.kind === 'window' ? '' : result.reason
      expect(text).not.toMatch(forbidden)
    }
  })

  it('never reports cloud as clear when it has none', () => {
    const got = cloudForWindow([], {
      start: new Date('2026-10-22T07:31:00Z'),
      end: new Date('2026-10-22T10:00:00Z'),
    })
    expect(got.kind === 'out-of-range' && got.reason).not.toMatch(forbidden)
  })
})

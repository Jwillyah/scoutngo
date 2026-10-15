import { describe, expect, it } from 'vitest'
import { feetToMeters } from './reachScale.ts'
import {
  compareToRating,
  interpolateBearing,
  knots,
  MPS_TO_KNOTS,
  windAtHeight,
  WIND_LEVELS_METERS,
  type LevelWind,
} from './windProfile.ts'

/*
 * THE MEASUREMENT THIS EXISTS FOR. Lynnhaven Inlet, 07:00 on 15 October 2026,
 * from Open-Meteo, converted to m/s from the km/h it serves:
 *
 *   10m    7.5 km/h = 2.08 m/s   from 338
 *   80m   15.1 km/h = 4.19 m/s   from 335
 *   120m  22.1 km/h = 6.14 m/s   from 316
 *   180m  27.0 km/h = 7.50 m/s   from 360
 *
 * Ground said 7.5 km/h and 180m said 27.0: three and a half times as much,
 * from a direction twenty-two degrees away.
 */
const MEASURED: LevelWind[] = [
  { heightMeters: 10, speedMps: 2.08, fromDegrees: 338 },
  { heightMeters: 80, speedMps: 4.19, fromDegrees: 335 },
  { heightMeters: 120, speedMps: 6.14, fromDegrees: 316 },
  { heightMeters: 180, speedMps: 7.5, fromDegrees: 360 },
]

describe('wind at the height you are flying', () => {
  it('serves the four heights Open-Meteo actually has', () => {
    expect([...WIND_LEVELS_METERS]).toEqual([10, 80, 120, 180])
  })

  /*
   * 400 FEET IS 122 METRES, which falls between the 120m and 180m levels. This
   * is the number the whole panel exists to show.
   */
  it('interpolates 400 feet between the 120m and 180m levels', () => {
    const at400 = windAtHeight(MEASURED, feetToMeters(400))
    expect(at400.interpolated).toBe(true)
    expect(at400.betweenMeters).toEqual([120, 180])
    // 121.9m is a twentieth of the way from 120 to 180.
    expect(at400.speedMps).toBeGreaterThan(6.14)
    expect(at400.speedMps).toBeLessThan(6.3)
  })

  it('is three and a half times the ground figure at 180m', () => {
    const ground = windAtHeight(MEASURED, 10)
    const high = windAtHeight(MEASURED, 180)
    expect(ground.speedMps).toBeCloseTo(2.08, 2)
    expect(high.speedMps).toBeCloseTo(7.5, 2)
    expect((high.speedMps ?? 0) / (ground.speedMps ?? 1)).toBeCloseTo(3.6, 1)
  })

  it('lands on a served level exactly, and says it is not interpolated', () => {
    for (const level of MEASURED) {
      const at = windAtHeight(MEASURED, level.heightMeters)
      expect(at.speedMps).toBeCloseTo(level.speedMps ?? 0, 6)
      expect(at.fromDegrees).toBeCloseTo(level.fromDegrees ?? 0, 6)
      expect(at.interpolated).toBe(false)
    }
  })

  it('interpolates linearly halfway between two levels', () => {
    const mid = windAtHeight(MEASURED, 100) // halfway from 80 to 120
    expect(mid.speedMps).toBeCloseTo((4.19 + 6.14) / 2, 6)
    expect(mid.interpolated).toBe(true)
  })

  /*
   * CLAMPED, NEVER EXTRAPOLATED. Guessing above the model's top level is
   * inventing weather, and 180m is about 590ft, past any legal drone ceiling.
   */
  it('clamps below the lowest level and above the highest', () => {
    const low = windAtHeight(MEASURED, 0)
    expect(low.speedMps).toBeCloseTo(2.08, 2)
    expect(low.interpolated).toBe(false)
    const high = windAtHeight(MEASURED, 500)
    expect(high.speedMps).toBeCloseTo(7.5, 2)
    expect(high.interpolated).toBe(false)
    expect(high.betweenMeters).toEqual([180])
  })

  /*
   * MISSING IS NOT ZERO. A level with no reading is skipped, because a
   * direction of zero is a confident claim of due north and a speed of zero is
   * a claim of calm.
   */
  it('skips a level the forecast did not fill in', () => {
    const gappy: LevelWind[] = [
      { heightMeters: 10, speedMps: 2, fromDegrees: 340 },
      { heightMeters: 80, speedMps: null, fromDegrees: null },
      { heightMeters: 120, speedMps: 6, fromDegrees: 340 },
      { heightMeters: 180, speedMps: 8, fromDegrees: 340 },
    ]
    const at100 = windAtHeight(gappy, 100)
    expect(at100.betweenMeters).toEqual([10, 120])
    expect(at100.speedMps).toBeCloseTo(2 + (6 - 2) * (90 / 110), 4)
  })

  it('reports nothing at all when no level has a reading', () => {
    const none: LevelWind[] = WIND_LEVELS_METERS.map((h) => ({
      heightMeters: h,
      speedMps: null,
      fromDegrees: null,
    }))
    const at = windAtHeight(none, 120)
    expect(at.speedMps).toBeNull()
    expect(at.fromDegrees).toBeNull()
    expect(at.interpolated).toBe(false)
  })
})

/*
 * DIRECTION GOES THE SHORT WAY ROUND. Between 350 and 10 the answer is 0, not
 * 180, and getting it wrong reverses the wind at exactly the heights where it
 * shears most. The measured profile above turns from 316 at 120m to 360 at
 * 180m, which crosses nothing, but 350 to 10 is one level apart in a northerly.
 */
describe('interpolating a bearing', () => {
  it('takes the short way across north', () => {
    expect(interpolateBearing(350, 10, 0.5)).toBeCloseTo(0, 6)
    expect(interpolateBearing(10, 350, 0.5)).toBeCloseTo(0, 6)
  })

  it('does not sweep the long way round', () => {
    expect(interpolateBearing(350, 10, 0.5)).not.toBeCloseTo(180, 0)
  })

  it('returns the ends at the ends', () => {
    expect(interpolateBearing(316, 360, 0)).toBeCloseTo(316, 6)
    expect(interpolateBearing(316, 360, 1)).toBeCloseTo(0, 6)
  })

  it('handles a half turn without preferring a side', () => {
    const got = interpolateBearing(0, 180, 0.5)
    expect(got === 90 || got === 270).toBe(true)
  })

  it('crosses north correctly in the measured profile', () => {
    // 120m is from 316 and 180m is from 360, so 150m is about 338.
    const at150 = windAtHeight(MEASURED, 150)
    expect(at150.fromDegrees).toBeCloseTo(338, 0)
  })
})

describe('knots, because that is how wind is spoken about', () => {
  it('converts from metres per second', () => {
    expect(knots(1)).toBeCloseTo(MPS_TO_KNOTS, 6)
    expect(knots(12)).toBeCloseTo(23.3, 1)
  })
})

/*
 * THE GUST AGAINST THE RATING: TWO NUMBERS AND WHICH IS LARGER.
 *
 * Never a verdict. The gust is what ends a flight rather than the average, so
 * the gust is what is compared, and whether to fly is the operator's call. Same
 * rule as the Part 107 ceiling.
 */
describe('comparing a gust to a published rating', () => {
  it('states both numbers and which is larger', () => {
    const out = compareToRating(11.8, 12)
    expect(out).toEqual({ gustMps: 11.8, ratedMps: 12, over: false })
    expect(compareToRating(13.2, 12)?.over).toBe(true)
  })

  it('is exactly at the rating without being over it', () => {
    expect(compareToRating(12, 12)?.over).toBe(false)
  })

  /* NO RATING, NO COMPARISON. An unverified limit is not stated at all. */
  it('says nothing when either number is missing', () => {
    expect(compareToRating(null, 12)).toBeNull()
    expect(compareToRating(13, null)).toBeNull()
    expect(compareToRating(null, null)).toBeNull()
  })
})

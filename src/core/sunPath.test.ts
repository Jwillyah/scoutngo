import { describe, expect, it } from 'vitest'
import { getPosition, getTimes } from 'suncalc'
import {
  altitudeRange,
  band,
  BAND_THRESHOLDS,
  DEFAULT_STEP_MINUTES,
  minutesApart,
  NOMINAL_THRESHOLDS,
  samplePath,
  SHOW_BOTH_MINUTES,
  SUNCALC_ALTITUDE_OFFSET_DEG,
  SUN_BANDS,
  sunCrossings,
  terrainHorizonCurve,
  type PathSample,
} from './sunPath.ts'
import type { HorizonSample } from './skyWindow.ts'

/** Little Devils Stairs Overlook, Shenandoah. Real relief. */
const OVERLOOK = { lat: 38.7567229, lon: -78.2675403 }
const DAY = new Date('2026-10-21T12:00:00-04:00')

describe('the calibration this chart is built on', () => {
  /*
   * THE OFFSET IS CONSTANT ACROSS THE WHOLE TWILIGHT RANGE, which is what
   * makes it a refraction convention rather than noise, and what makes it
   * safe to add to every threshold rather than only to the two nightWindow.ts
   * already pins. Measured at all four of this build's own event times.
   */
  it('holds at sunset, dusk, nautical dusk and night alike', () => {
    const times = getTimes(DAY, OVERLOOK.lat, OVERLOOK.lon)
    const pairs: [Date | null, number][] = [
      [times.sunset, NOMINAL_THRESHOLDS.horizon],
      [times.dusk, NOMINAL_THRESHOLDS.civil],
      [times.nauticalDusk, NOMINAL_THRESHOLDS.nautical],
      [times.night, NOMINAL_THRESHOLDS.astronomical],
    ]
    let checked = 0
    for (const [at, nominal] of pairs) {
      if (at === null || Number.isNaN(at.getTime())) continue
      const altitude = getPosition(at, OVERLOOK.lat, OVERLOOK.lon).altitude
      expect(altitude - nominal).toBeCloseTo(SUNCALC_ALTITUDE_OFFSET_DEG, 3)
      checked += 1
    }
    /* All four, or the loop proved nothing. */
    expect(checked).toBe(4)
  })

  it('carries the offset into every band threshold', () => {
    expect(BAND_THRESHOLDS.horizon).toBeCloseTo(-0.349, 3)
    expect(BAND_THRESHOLDS.civil).toBeCloseTo(-5.516, 3)
    expect(BAND_THRESHOLDS.nautical).toBeCloseTo(-11.516, 3)
    expect(BAND_THRESHOLDS.astronomical).toBeCloseTo(-17.516, 3)
  })
})

describe('sampling the path', () => {
  const samples = samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY)

  it('covers a whole local day at ten minute steps', () => {
    expect(DEFAULT_STEP_MINUTES).toBe(10)
    expect(samples).toHaveLength(145)
    const span = (samples.at(-1)?.t.getTime() ?? 0) - (samples[0]?.t.getTime() ?? 0)
    expect(span).toBe(86_400_000)
  })

  it('reports azimuth clockwise from north, with no radian conversion applied', () => {
    /*
     * THIS TEST CAUGHT A REAL BUG. A first draft converted radians-from-south
     * to compass degrees, which is what suncalc's documented API returns and
     * is NOT what this build returns: it already hands back compass degrees.
     * The conversion put the noon sun at 96 degrees. sun.ts has carried that
     * finding for a long time; this file simply was not reusing it.
     */
    for (const sample of samples) {
      expect(sample.sunAzimuth).toBeGreaterThanOrEqual(0)
      expect(sample.sunAzimuth).toBeLessThan(360)
      expect(sample.moonAzimuth).toBeGreaterThanOrEqual(0)
      expect(sample.moonAzimuth).toBeLessThan(360)
    }
    /* At local solar noon the sun is due south from Virginia. */
    const highest = samples.reduce((a, b) => (b.sunAltitude > a.sunAltitude ? b : a))
    expect(highest.sunAzimuth).toBeGreaterThan(150)
    expect(highest.sunAzimuth).toBeLessThan(210)
  })

  it('reports altitude in degrees for both bodies', () => {
    const extreme = samples.reduce((a, b) => (Math.abs(b.sunAltitude) > Math.abs(a.sunAltitude) ? b : a))
    expect(Math.abs(extreme.sunAltitude)).toBeGreaterThan(Math.PI / 2)
    expect(Math.abs(extreme.sunAltitude)).toBeLessThanOrEqual(90)
    for (const sample of samples) {
      expect(Math.abs(sample.moonAltitude)).toBeLessThanOrEqual(90)
    }
  })

  it('keeps the moon fraction between new and full', () => {
    for (const sample of samples) {
      expect(sample.moonIllumination).toBeGreaterThanOrEqual(0)
      expect(sample.moonIllumination).toBeLessThanOrEqual(1)
    }
  })

  it('returns nothing rather than guessing for unusable input', () => {
    expect(samplePath(Number.NaN, 0, DAY)).toEqual([])
    expect(samplePath(0, Number.NaN, DAY)).toEqual([])
    expect(samplePath(0, 0, new Date('not a date'))).toEqual([])
  })

  it('falls back to the default step rather than hanging on a zero step', () => {
    expect(samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY, 0)).toHaveLength(145)
    expect(samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY, -5)).toHaveLength(145)
  })
})

describe('the bands', () => {
  it('names every band once, brightest first', () => {
    expect(SUN_BANDS).toEqual(['day', 'golden', 'blue', 'nautical', 'astronomical', 'night'])
    expect(new Set(SUN_BANDS).size).toBe(6)
  })

  it('puts each altitude in the band the convention names', () => {
    expect(band(40)).toBe('day')
    expect(band(20)).toBe('day')
    expect(band(3)).toBe('golden')
    expect(band(0)).toBe('golden')
    expect(band(-3)).toBe('blue')
    expect(band(-9)).toBe('nautical')
    expect(band(-15)).toBe('astronomical')
    expect(band(-40)).toBe('night')
  })

  it('is contiguous and exhaustive: every altitude has exactly one band', () => {
    for (let a = -90; a <= 90; a += 0.25) {
      expect(SUN_BANDS).toContain(band(a))
    }
  })

  it('changes band exactly at the calibrated edges, not the textbook ones', () => {
    const e = 0.0001
    expect(band(BAND_THRESHOLDS.horizon + e)).toBe('golden')
    expect(band(BAND_THRESHOLDS.horizon - e)).toBe('blue')
    expect(band(BAND_THRESHOLDS.civil + e)).toBe('blue')
    expect(band(BAND_THRESHOLDS.civil - e)).toBe('nautical')
    /* And the textbook edge is NOT where it changes, by about half a degree. */
    expect(band(NOMINAL_THRESHOLDS.horizon)).toBe('blue')
  })

  it('treats a non-number as night rather than throwing', () => {
    expect(band(Number.NaN)).toBe('night')
  })
})

describe('the terrain horizon curve', () => {
  const samples = samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY)

  /* A ridge in the east only, so the curve must not be a constant. */
  const ridge: HorizonSample[] = Array.from({ length: 24 }, (_, i) => ({
    azimuth: i * 15,
    angleDegrees: i * 15 >= 60 && i * 15 <= 120 ? 9 : 1,
  }))

  it('is a curve, not a line, because the azimuth sweeps', () => {
    const got = terrainHorizonCurve({ kind: 'terrain', samples: ridge }, samples)
    expect(got.kind).toBe('terrain')
    if (got.kind !== 'terrain') return
    expect(got.angles).toHaveLength(samples.length)
    expect(new Set(got.angles).size).toBeGreaterThan(1)
    expect(Math.max(...got.angles)).toBe(9)
    expect(Math.min(...got.angles)).toBe(1)
  })

  it('says flat with a reason rather than returning zeroes', () => {
    const got = terrainHorizonCurve({ kind: 'flat' }, samples)
    expect(got.kind).toBe('flat')
    if (got.kind !== 'flat') return
    expect(got.reason).toMatch(/no elevation data/i)
    expect(got.reason).toMatch(/flat/i)
    expect(JSON.stringify(got)).not.toContain('"angles"')
  })

  it('says flat with a reason when the profile has no directions in it', () => {
    const got = terrainHorizonCurve({ kind: 'terrain', samples: [] }, samples)
    expect(got.kind).toBe('flat')
  })
})

describe('the crossings, which are the product', () => {
  const samples = samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY)

  it('agrees with suncalc’s own sunrise and sunset to under a minute', () => {
    /*
     * THE CHECK THAT VALIDATES BOTH CHOICES AT ONCE: the calibrated horizon
     * threshold and the linear interpolation between ten-minute samples. If
     * either were wrong this would be minutes out, not seconds.
     */
    const flat = terrainHorizonCurve({ kind: 'flat' }, samples)
    const got = sunCrossings(samples, flat)
    const times = getTimes(DAY, OVERLOOK.lat, OVERLOOK.lon)
    expect(minutesApart(got.flatRise, times.sunrise ?? null) ?? 99).toBeLessThan(1)
    expect(minutesApart(got.flatSet, times.sunset ?? null) ?? 99).toBeLessThan(1)
  })

  it('makes the sun rise later and set earlier behind a ridge', () => {
    const ridge: HorizonSample[] = Array.from({ length: 24 }, (_, i) => ({
      azimuth: i * 15,
      angleDegrees: 8,
    }))
    const terrain = terrainHorizonCurve({ kind: 'terrain', samples: ridge }, samples)
    const got = sunCrossings(samples, terrain)
    expect(got.terrainRise).not.toBeNull()
    expect(got.terrainSet).not.toBeNull()
    expect((got.terrainRise?.getTime() ?? 0) > (got.flatRise?.getTime() ?? 0)).toBe(true)
    expect((got.terrainSet?.getTime() ?? 0) < (got.flatSet?.getTime() ?? 0)).toBe(true)
  })

  it('makes the sun rise EARLIER from a summit, where the land falls away', () => {
    const summit: HorizonSample[] = Array.from({ length: 24 }, (_, i) => ({
      azimuth: i * 15,
      angleDegrees: -2,
    }))
    const terrain = terrainHorizonCurve({ kind: 'terrain', samples: summit }, samples)
    const got = sunCrossings(samples, terrain)
    expect((got.terrainRise?.getTime() ?? 0) < (got.flatRise?.getTime() ?? 0)).toBe(true)
  })

  it('reports no terrain crossing at all when there is no terrain', () => {
    const got = sunCrossings(samples, terrainHorizonCurve({ kind: 'flat' }, samples))
    expect(got.terrainRise).toBeNull()
    expect(got.terrainSet).toBeNull()
    expect(got.flatRise).not.toBeNull()
  })

  it('returns nulls rather than inventing a sunrise in polar night', () => {
    const polar = samplePath(78.22, 15.63, new Date('2026-12-21T12:00:00Z'))
    const got = sunCrossings(polar, terrainHorizonCurve({ kind: 'flat' }, polar))
    expect(got.flatRise).toBeNull()
    expect(got.flatSet).toBeNull()
  })

  it('keeps two minutes as the threshold for showing both times', () => {
    expect(SHOW_BOTH_MINUTES).toBe(2)
    expect(minutesApart(null, new Date())).toBeNull()
    expect(minutesApart(new Date(0), new Date(180_000))).toBe(3)
  })
})

describe('the altitude range', () => {
  it('spans the day it was given, with headroom', () => {
    const samples = samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY)
    const range = altitudeRange(samples)
    const alts = samples.map((s) => s.sunAltitude)
    expect(range.min).toBeLessThan(Math.min(...alts))
    expect(range.max).toBeGreaterThan(Math.max(...alts))
  })

  it('does not turn a shallow midday window into a mountain', () => {
    /*
     * An hour either side of noon moves the sun two or three degrees. Auto
     * ranging that tightly would draw a dramatic arc and lie about how much
     * the light actually changes, so the span has a floor.
     */
    const all = samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY)
    const noon = all.filter((s) => {
      const h = s.t.getHours()
      return h >= 11 && h <= 13
    })
    const range = altitudeRange(noon)
    expect(range.max - range.min).toBeGreaterThanOrEqual(10)
  })

  it('never returns a degenerate range, even with nothing to range', () => {
    const empty = altitudeRange([])
    expect(empty.max).toBeGreaterThan(empty.min)
    const broken: PathSample[] = [
      {
        t: new Date(),
        sunAltitude: Number.NaN,
        sunAzimuth: 0,
        moonAltitude: 0,
        moonAzimuth: 0,
        moonIllumination: 0,
      },
    ]
    const got = altitudeRange(broken)
    expect(got.max).toBeGreaterThan(got.min)
    expect(Number.isFinite(got.min)).toBe(true)
  })
})

describe('the horizon is always inside the drawn range', () => {
  /*
   * THE BUG THIS PREVENTS: a midday window auto-ranged to the sun's own 30-50
   * degrees put the terrain horizon, at about 0, off the bottom of the chart.
   * The one line the feature exists to draw was invisible for exactly the
   * windows a shooter uses most.
   */
  const all = samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY)
  const midday = all.filter((s) => s.t.getHours() >= 11 && s.t.getHours() <= 15)

  it('is ranging a window whose sun never goes near the horizon', () => {
    /* The precondition. Without this the next assertion proves nothing. */
    const lowest = Math.min(...midday.map((s) => s.sunAltitude))
    expect(lowest).toBeGreaterThan(20)
  })

  it('includes zero anyway, so the horizon lines are on the chart', () => {
    const range = altitudeRange(midday)
    expect(range.min).toBeLessThanOrEqual(0)
    expect(range.max).toBeGreaterThan(0)
  })

  it('includes a high ridge too, not just the flat line', () => {
    const range = altitudeRange(midday, 3, [12, 14, 9])
    expect(range.min).toBeLessThanOrEqual(0)
    expect(range.max).toBeGreaterThan(14)
  })

  it('still never returns a degenerate range', () => {
    const got = altitudeRange([], 3, [5])
    expect(got.max).toBeGreaterThan(got.min)
  })
})

describe('a flat DEM must agree with the flat line', () => {
  /*
   * THE REGRESSION THIS PINS. The terrain crossing compared the sun against
   * the RAW ridge angle while the flat crossing used the refraction-corrected
   * threshold, so a perfectly flat DEM disagreed with the flat horizon by
   * about two minutes -- a gap manufactured by mixing two conventions, in the
   * exact number the UI prints as "over the ridge" versus "flat".
   */
  const samples = samplePath(OVERLOOK.lat, OVERLOOK.lon, DAY)
  const flatDem: HorizonSample[] = Array.from({ length: 24 }, (_, i) => ({
    azimuth: i * 15,
    angleDegrees: 0,
  }))

  it('puts terrain sunrise and flat sunrise at the same instant', () => {
    const got = sunCrossings(samples, terrainHorizonCurve({ kind: 'terrain', samples: flatDem }, samples))
    expect(minutesApart(got.terrainRise, got.flatRise) ?? 99).toBeLessThan(0.1)
    expect(minutesApart(got.terrainSet, got.flatSet) ?? 99).toBeLessThan(0.1)
  })

  it('still separates them once the ground is not flat', () => {
    const ridge: HorizonSample[] = Array.from({ length: 24 }, (_, i) => ({
      azimuth: i * 15,
      angleDegrees: 5,
    }))
    const got = sunCrossings(samples, terrainHorizonCurve({ kind: 'terrain', samples: ridge }, samples))
    expect(minutesApart(got.terrainRise, got.flatRise) ?? 0).toBeGreaterThan(10)
  })
})

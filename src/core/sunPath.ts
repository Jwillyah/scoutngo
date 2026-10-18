/*
 * THE DAY AS A CURVE, NOT AS A STRIP.
 *
 * Pure arithmetic over suncalc. No React, no fetch, no model.
 *
 * WHY ALTITUDE GOES ON AN AXIS. The gradient strip answers WHEN. It cannot
 * answer HOW HIGH, and how high is the thing that decides whether light rakes
 * across a face or flattens it. Two shoots at the same clock time in March and
 * June are different shoots, and on a strip they look identical.
 *
 * WHAT IS HERE: the sampled path of the sun and the moon, the band each
 * altitude falls in, and the terrain's own elevation angle along the sun's
 * azimuth. What is NOT here is any drawing: the chart reads these numbers.
 */

import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc'
import { horizonAngleAt, type HorizonInput } from './skyWindow.ts'

/** One instant on the path. Angles in degrees, azimuth clockwise from north. */
export interface PathSample {
  t: Date
  sunAltitude: number
  sunAzimuth: number
  moonAltitude: number
  moonAzimuth: number
  /** 0 at new, 1 at full. Drawn as the moon line's opacity. */
  moonIllumination: number
}

/** Ten minutes. Fine enough that the curve has no visible corners at 100px. */
export const DEFAULT_STEP_MINUTES = 10

/*
 * AZIMUTH IS ALREADY A COMPASS BEARING IN THIS BUILD, SO THERE IS NO
 * CONVERSION HERE -- AND THE FIRST DRAFT PUT ONE IN.
 *
 * suncalc's documented API returns azimuth in radians measured from south.
 * This build does not: it returns degrees clockwise from north, 180.75 at
 * solar noon from Virginia. src/core/sun.ts already carries that finding and
 * says in as many words that applying the radian conversion "put the midday
 * sun at 88 degrees instead of 180".
 *
 * A first draft of this file applied it anyway and put the noon sun at 96
 * degrees. The test that caught it asserts the sun is due south at its highest
 * from the northern hemisphere, which is the same sanity check sun.test.ts
 * has had all along -- the check existed, the new file just was not using it.
 * normalizeBearing is sun.ts's own, reused rather than copied.
 */
import { normalizeBearing } from './sun.ts'

/** Local midnight on the day containing an instant. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

/**
 * The sun and moon across the local day containing `date`.
 *
 * THE WHOLE DAY, not just the shoot window, and the reason is the crossings.
 * Real sunrise and real sunset are where the curve meets the terrain, and at a
 * venue with a shoot window of 11:00 to 15:00 neither crossing is inside the
 * window. The chart draws the window; the crossings are computed from this and
 * reported whether or not they are on screen.
 */
export function samplePath(
  lat: number,
  lon: number,
  date: Date,
  stepMinutes: number = DEFAULT_STEP_MINUTES,
): PathSample[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return []
  const step = Number.isFinite(stepMinutes) && stepMinutes > 0 ? stepMinutes : DEFAULT_STEP_MINUTES

  const begin = startOfLocalDay(date).getTime()
  const end = begin + 86_400_000
  const out: PathSample[] = []
  for (let t = begin; t <= end; t += step * 60_000) {
    const at = new Date(t)
    const sun = getPosition(at, lat, lon)
    const moon = getMoonPosition(at, lat, lon)
    out.push({
      t: at,
      /*
       * DEGREES ALREADY. This suncalc build reports altitude in degrees for
       * both bodies, which is pinned by a test, because a build that returned
       * radians would make every altitude about 57 times too small and this
       * whole chart a flat line through zero.
       */
      sunAltitude: sun.altitude,
      sunAzimuth: normalizeBearing(sun.azimuth),
      moonAltitude: moon.altitude,
      moonAzimuth: normalizeBearing(moon.azimuth),
      moonIllumination: getMoonIllumination(at).fraction,
    })
  }
  return out
}

export type SunBand = 'day' | 'golden' | 'blue' | 'nautical' | 'astronomical' | 'night'

/*
 * THE THRESHOLDS, IN ONE PLACE, AND WHY THEY ARE NOT THE TEXTBOOK NUMBERS.
 *
 * THE CONVENTION. The standard altitudes are: the geometric horizon at
 * -0.833 degrees (the sun's semidiameter plus mean refraction, which is the
 * definition sunrise and sunset use); civil twilight to -6; nautical twilight
 * to -12; astronomical twilight to -18. Golden hour has no standards body
 * behind it at all -- it is a photographer's term -- and the upper edge is
 * taken at +6, which is the figure the app has used since lighting.ts.
 *
 * THE CALIBRATION. This suncalc build's getPosition disagrees with its own
 * getTimes by a constant +0.48396 degrees: measured at its own sunset the
 * reported altitude is -0.349 rather than -0.833, and at its own `night`
 * boundary it is -17.516 rather than -18. See the long note in nightWindow.ts,
 * which pins the first two of those as constants.
 *
 * SO THE THRESHOLDS CARRY THE OFFSET. The chart plots getPosition's altitudes,
 * so a band edge drawn at the textbook -0.833 would sit about two minutes away
 * from the sunset time printed beside it, and the drawn curve would cross the
 * band edge at the wrong place. Adding the offset makes three things agree by
 * construction: where the line crosses, where the band changes, and what the
 * clock says. That is worth more on an instrument than matching a textbook
 * number that this build does not use either.
 */
export const SUNCALC_ALTITUDE_OFFSET_DEG = 0.48396

/** Nominal, as the convention states them. Not what the comparisons use. */
export const NOMINAL_THRESHOLDS = {
  golden: 6,
  horizon: -0.833,
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const

/** The same edges in this build's own units. These are what band() compares. */
export const BAND_THRESHOLDS = {
  golden: NOMINAL_THRESHOLDS.golden + SUNCALC_ALTITUDE_OFFSET_DEG,
  horizon: NOMINAL_THRESHOLDS.horizon + SUNCALC_ALTITUDE_OFFSET_DEG,
  civil: NOMINAL_THRESHOLDS.civil + SUNCALC_ALTITUDE_OFFSET_DEG,
  nautical: NOMINAL_THRESHOLDS.nautical + SUNCALC_ALTITUDE_OFFSET_DEG,
  astronomical: NOMINAL_THRESHOLDS.astronomical + SUNCALC_ALTITUDE_OFFSET_DEG,
} as const

/** Which band an altitude falls in. Contiguous and exhaustive. */
export function band(sunAltitude: number): SunBand {
  if (!Number.isFinite(sunAltitude)) return 'night'
  if (sunAltitude > BAND_THRESHOLDS.golden) return 'day'
  if (sunAltitude > BAND_THRESHOLDS.horizon) return 'golden'
  if (sunAltitude > BAND_THRESHOLDS.civil) return 'blue'
  if (sunAltitude > BAND_THRESHOLDS.nautical) return 'nautical'
  if (sunAltitude > BAND_THRESHOLDS.astronomical) return 'astronomical'
  return 'night'
}

/** The bands in order, brightest first, for a legend or a palette. */
export const SUN_BANDS: readonly SunBand[] = [
  'day',
  'golden',
  'blue',
  'nautical',
  'astronomical',
  'night',
] as const

/**
 * THE TERRAIN'S OWN ANGLE, ALONG THE SUN'S AZIMUTH, AT EVERY SAMPLE.
 *
 * A CURVE, NOT A LINE, and that is the whole point. The sun's azimuth sweeps
 * through a hundred degrees or more across a day, so the ridge it is behind at
 * dawn is not the ridge it sets behind. A single horizon angle would be right
 * twice a day and wrong in between.
 *
 * A REASON, NOT A ZERO, when the DEM has nothing. Zero is a claim that the
 * horizon is flat, which is exactly the claim this exists to replace, so the
 * caller gets 'flat' with a sentence and the chart draws the flat line
 * DIFFERENTLY and says it is flat. Same rule as skyWindow's horizonSource.
 */
export type TerrainCurve =
  | { kind: 'terrain'; angles: number[] }
  | { kind: 'flat'; reason: string }

export function terrainHorizonCurve(
  horizon: HorizonInput,
  samples: readonly PathSample[],
): TerrainCurve {
  if (horizon.kind === 'flat') {
    return {
      kind: 'flat',
      reason: 'No elevation data here, so the horizon is drawn flat at 0°',
    }
  }
  if (horizon.samples.length === 0) {
    return {
      kind: 'flat',
      reason: 'The elevation data returned no directions, so the horizon is drawn flat at 0°',
    }
  }
  return {
    kind: 'terrain',
    angles: samples.map((sample) => horizonAngleAt(horizon, sample.sunAzimuth)),
  }
}

/**
 * A crossing of the sun curve and a horizon, interpolated between samples.
 *
 * LINEARLY, between the two samples that straddle it. At ten minute steps and
 * the rates these curves move, that is good to a few seconds, which is far
 * finer than the minute the app prints.
 */
function crossing(
  samples: readonly PathSample[],
  horizonAt: (index: number) => number,
  direction: 'rising' | 'setting',
): Date | null {
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1]
    const current = samples[i]
    if (previous === undefined || current === undefined) continue
    const before = previous.sunAltitude - horizonAt(i - 1)
    const after = current.sunAltitude - horizonAt(i)
    const up = before <= 0 && after > 0
    const down = before >= 0 && after < 0
    if ((direction === 'rising' && up) || (direction === 'setting' && down)) {
      const span = after - before
      const share = span === 0 ? 0 : -before / span
      return new Date(previous.t.getTime() + share * (current.t.getTime() - previous.t.getTime()))
    }
  }
  return null
}

export interface Crossings {
  /** Where the curve meets the real skyline, or null when it never does. */
  terrainRise: Date | null
  terrainSet: Date | null
  /** Where it meets a flat horizon. The almanac answer. */
  flatRise: Date | null
  flatSet: Date | null
}

/**
 * Real sunrise and sunset at this venue, and the flat-horizon pair beside them.
 *
 * THE GAP IS THE PRODUCT. An almanac gives the flat pair, and in a valley or
 * behind a ridge the real one is many minutes away from it. Both are returned
 * so the UI can show both whenever they differ by enough to matter, which is
 * the one number that says why this is better than looking it up.
 */
export function sunCrossings(samples: readonly PathSample[], terrain: TerrainCurve): Crossings {
  const flatAt = () => BAND_THRESHOLDS.horizon

  /*
   * THE RIDGE CARRIES THE SAME ALLOWANCE THE FLAT HORIZON DOES.
   *
   * Sunrise on a flat horizon is not the sun's centre at 0: it is the centre
   * at -0.833, because the upper limb appears first and refraction lifts it.
   * A ridge is the same geometry moved up by its own angle, so the sun clears
   * a ridge at angle h when its centre reaches h - 0.833, not h.
   *
   * WHAT IT COST TO GET WRONG: comparing the raw ridge angle against the
   * corrected flat threshold made the two disagree by about two minutes even
   * on a DEM that is perfectly flat -- a difference manufactured entirely by
   * comparing two different conventions, in exactly the gap the UI reports as
   * the reason this beats an almanac. With the allowance, a flat DEM and the
   * flat line give the same instant, which is the test below.
   */
  const terrainAt =
    terrain.kind === 'terrain'
      ? (i: number) => (terrain.angles[i] ?? 0) + BAND_THRESHOLDS.horizon
      : flatAt

  return {
    terrainRise: terrain.kind === 'terrain' ? crossing(samples, terrainAt, 'rising') : null,
    terrainSet: terrain.kind === 'terrain' ? crossing(samples, terrainAt, 'setting') : null,
    flatRise: crossing(samples, flatAt, 'rising'),
    flatSet: crossing(samples, flatAt, 'setting'),
  }
}

/**
 * How many minutes apart two instants are, or null when either is missing.
 *
 * TWO MINUTES IS THE THRESHOLD for showing both times, and it is not
 * arbitrary: the app prints times to the minute, and the calibrated band edges
 * above are themselves worth about two minutes of clock. A gap smaller than
 * that is inside the noise of what this can honestly resolve.
 */
export const SHOW_BOTH_MINUTES = 2

export function minutesApart(a: Date | null, b: Date | null): number | null {
  if (a === null || b === null) return null
  return Math.abs(a.getTime() - b.getTime()) / 60_000
}

/**
 * THE DAY'S OWN EXTENT: astronomical dawn to astronomical dusk.
 *
 * NOT THE SHOOT WINDOW, which is what the first version used and which made
 * the chart useless: an 18:02 to 18:55 window drew a 53-minute segment of a
 * curve, which has no shape in it at all. A day has a shape; a shoot window
 * is a mark ON that shape.
 *
 * Falls back to the whole local day where there is no astronomical twilight
 * to find -- a polar summer has no dawn, and the honest extent there is the
 * day itself rather than nothing.
 */
export function dayExtent(
  samples: readonly PathSample[],
): { start: Date; end: Date } | null {
  if (samples.length < 2) return null
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (first === undefined || last === undefined) return null

  let dawn: Date | null = null
  let dusk: Date | null = null
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1]
    const current = samples[i]
    if (previous === undefined || current === undefined) continue
    const was = previous.sunAltitude > BAND_THRESHOLDS.astronomical
    const is = current.sunAltitude > BAND_THRESHOLDS.astronomical
    if (!was && is && dawn === null) dawn = current.t
    if (was && !is) dusk = current.t
  }
  if (dawn === null || dusk === null || dusk.getTime() <= dawn.getTime()) {
    return { start: first.t, end: last.t }
  }
  /* A little air either side so the curve does not start on the frame edge. */
  const pad = 20 * 60_000
  return { start: new Date(dawn.getTime() - pad), end: new Date(dusk.getTime() + pad) }
}

/**
 * The altitude range to draw, with headroom, never degenerate.
 *
 * THE HORIZON IS ALWAYS IN RANGE, and that is not a nicety. Auto-ranging to
 * the sun's own min and max puts a midday window somewhere between 30 and 50
 * degrees, and the terrain horizon at about 0 falls off the bottom of the
 * chart entirely -- so the one line the whole feature is about would be
 * invisible for exactly the windows a shooter uses most. Passing the horizon
 * angles in widens the range to include them.
 */
export function altitudeRange(
  samples: readonly PathSample[],
  padDegrees = 3,
  horizonAngles: readonly number[] = [],
  /*
   * THE MOON IS IN RANGE WHENEVER IT IS UP.
   *
   * ONE SOURCE, ONE FACT. The readout printed "moon 24 degrees" beside a
   * chart with no moon line on it, because the range was built from the sun
   * alone and the moon's arc fell outside it. A readout and a curve that
   * disagree about whether there is a moon are two sources for one fact.
   */
  includeMoon = true,
): { min: number; max: number } {
  if (samples.length === 0) return { min: -10, max: 10 }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const sample of samples) {
    if (!Number.isFinite(sample.sunAltitude)) continue
    min = Math.min(min, sample.sunAltitude)
    max = Math.max(max, sample.sunAltitude)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -10, max: 10 }

  /*
   * Zero is included alongside the terrain angles, because the flat line is
   * drawn at zero whenever the two horizons are being compared and a
   * comparison with one line off screen is not a comparison.
   */
  if (includeMoon) {
    for (const sample of samples) {
      if (!Number.isFinite(sample.moonAltitude)) continue
      if (sample.moonAltitude <= 0) continue
      min = Math.min(min, sample.moonAltitude)
      max = Math.max(max, sample.moonAltitude)
    }
  }

  for (const angle of [0, ...horizonAngles]) {
    if (!Number.isFinite(angle)) continue
    min = Math.min(min, angle)
    max = Math.max(max, angle)
  }
  /*
   * A FLOOR ON THE SPAN. A window of an hour either side of noon has a range
   * of two or three degrees, and auto-ranging that tightly turns a gentle arc
   * into a mountain and makes the chart lie about how much the light changes.
   */
  if (max - min < 10) {
    const middle = (max + min) / 2
    min = middle - 5
    max = middle + 5
  }
  return { min: min - padDegrees, max: max + padDegrees }
}

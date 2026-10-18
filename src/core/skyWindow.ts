/*
 * WHEN A THING IN THE SKY IS ACTUALLY SHOOTABLE FROM HERE, TONIGHT.
 *
 * Pure arithmetic over suncalc and src/core/celestial.ts. No fetch, no model.
 *
 * THE WINDOW IS AN INTERSECTION OF THREE FACTS, each of which is separately
 * computable and separately reportable:
 *
 *   the target is above the horizon
 *   the sun is below -18 degrees, which is astronomical dark
 *   the moon is below the horizon          (meteors and milky way only)
 *
 * All three are returned alongside the window, because "the window is 03:32 to
 * 06:01" is far less useful than "the window is 03:32 to 06:01, and it starts
 * when the moon sets and ends when the sky starts to brighten". The shooter
 * plans around the binding constraint, not around the window.
 *
 * THE HORIZON IS THE REAL ONE WHERE THE DEM REACHES. A radiant clearing a
 * ridge at 12:30 instead of a flat horizon at 11:47 is the entire reason this
 * is worth building rather than installing an astronomy app, so horizonSource
 * is returned on every answer and there is NO silent fallback: asking for a
 * terrain horizon and getting no samples is a stated reason, not a quiet zero.
 *
 * WHAT THIS NEVER SAYS. It does not say a night is clear, or good, or worth
 * driving to. It states times and the constraints that produced them. Cloud is
 * reported separately, only where the forecast reaches, and says so where it
 * does not. skyWindow.test.ts fails on the words.
 */

import { getPosition, getTimes, getMoonPosition } from 'suncalc'
import { equatorialToHorizontal, GALACTIC_CORE, showerById, type ShowerId } from './celestial.ts'

/** What is being shot. The union is the whole vocabulary. */
export type SkyTarget =
  | { kind: 'meteors'; shower: ShowerId }
  | { kind: 'milkyway' }
  | { kind: 'moon' }

export interface Interval {
  start: Date
  end: Date
}

/** One direction's terrain horizon, in degrees above the observer's horizontal. */
export interface HorizonSample {
  /** Clockwise from north. */
  azimuth: number
  /** Degrees above horizontal. Negative is real: from a summit the land falls away. */
  angleDegrees: number
}

/**
 * Where the horizon comes from.
 *
 * TWO CASES AND NO THIRD. Either the DEM answered and we use the real skyline,
 * or it did not and the caller says so by passing 'flat'. There is deliberately
 * no "terrain if you have it, flat otherwise" variant: that is the silent
 * fallback this file exists to refuse.
 */
export type HorizonInput =
  | { kind: 'terrain'; samples: readonly HorizonSample[] }
  | { kind: 'flat' }

export type HorizonSource = 'terrain' | 'flat'

/**
 * The horizon angle looking along a bearing.
 *
 * NEAREST SAMPLE, NOT INTERPOLATED. A skyline is not smooth; between two
 * samples 15 degrees apart there can be a notch or a tower, and interpolating
 * invents a horizon that is lower than the real one about half the time.
 * Taking the nearest measured direction keeps every number in the answer
 * traceable to a DEM sample that actually exists.
 */
export function horizonAngleAt(horizon: HorizonInput, azimuth: number): number {
  if (horizon.kind === 'flat') return 0
  let best: HorizonSample | null = null
  let bestGap = Number.POSITIVE_INFINITY
  for (const sample of horizon.samples) {
    const raw = Math.abs(((sample.azimuth - azimuth) % 360) + 360) % 360
    const gap = Math.min(raw, 360 - raw)
    if (gap < bestGap) {
      bestGap = gap
      best = sample
    }
  }
  return best?.angleDegrees ?? 0
}

/** Where a target is at an instant. */
function targetPosition(
  target: SkyTarget,
  at: Date,
  lat: number,
  lon: number,
): { altitude: number; azimuth: number } | null {
  if (target.kind === 'moon') {
    const moon = getMoonPosition(at, lat, lon)
    /*
     * This suncalc build reports altitude in DEGREES, not radians, and the
     * same is true of getPosition. Pinned by a test, because a build that
     * changed the convention would silently turn every altitude into a number
     * about 57 times too small and every window into nothing at all.
     */
    return { altitude: moon.altitude, azimuth: ((moon.azimuth * 180) / Math.PI + 180) % 360 }
  }
  const point =
    target.kind === 'milkyway'
      ? GALACTIC_CORE
      : (() => {
          const shower = showerById(target.shower)
          return shower === null ? null : { ra: shower.radiantRa, dec: shower.radiantDec }
        })()
  if (point === null) return null
  return equatorialToHorizontal(point.ra, point.dec, lat, lon, at)
}

/** How high the moon is at an instant, in degrees. */
function moonAltitude(at: Date, lat: number, lon: number): number {
  return getMoonPosition(at, lat, lon).altitude
}

/** The constraints, each with the span over which it is satisfied. */
export interface SkyConstraints {
  /** When the target is above the horizon, within the dark span. */
  targetUp: Interval | null
  /** When the sun is below -18 degrees. */
  astronomicalDark: Interval | null
  /**
   * When the moon is below the horizon. Null when it never is, and absent
   * from the intersection entirely for a moon shoot.
   */
  moonDown: Interval | null
}

export type BindingConstraint = 'target' | 'dark' | 'moon'

export interface SkyWindow {
  kind: 'window'
  window: Interval
  constraints: SkyConstraints
  /** Which constraint sets each edge. This is the thing the UI prints. */
  startsBecause: BindingConstraint
  endsBecause: BindingConstraint
  horizonSource: HorizonSource
  /** The target's altitude at the middle of the window, for ranking nights. */
  altitudeAtMidWindow: number
}

export interface NoSkyWindow {
  kind: 'none'
  /** Which constraint never let the others through, in the shooter's words. */
  reason: string
  constraints: SkyConstraints
  horizonSource: HorizonSource
}

export interface UnknownSkyWindow {
  kind: 'unknown'
  /** Why nothing could be computed. Never a guess, never an empty window. */
  reason: string
}

export type SkyWindowResult = SkyWindow | NoSkyWindow | UnknownSkyWindow

/**
 * One minute. The window is printed to the minute, so computing it finer would
 * be precision the output throws away, and coarser would round the edge of a
 * ridge by more than the ridge is worth.
 */
const STEP_MS = 60_000

const MINUTE = 60_000

/** The longest run of consecutive true values, as an interval, or null. */
function longestRun(times: readonly Date[], flags: readonly boolean[]): Interval | null {
  let bestStart = -1
  let bestLength = 0
  let runStart = -1
  for (let i = 0; i <= flags.length; i += 1) {
    const on = i < flags.length && flags[i] === true
    if (on && runStart === -1) runStart = i
    if (!on && runStart !== -1) {
      const length = i - runStart
      if (length > bestLength) {
        bestLength = length
        bestStart = runStart
      }
      runStart = -1
    }
  }
  if (bestStart === -1 || bestLength === 0) return null
  const start = times[bestStart]
  const end = times[bestStart + bestLength - 1]
  if (start === undefined || end === undefined) return null
  return { start, end }
}

const usable = (at: unknown): at is Date => at instanceof Date && !Number.isNaN(at.getTime())

export interface SkyWindowInput {
  target: SkyTarget
  /** The venue. Null is a missing input and produces a reason. */
  at: { lat: number; lon: number } | null
  /**
   * The night to compute, identified by its EVENING. The window runs from
   * astronomical dark on this date to astronomical dawn on the next, which is
   * how a shooter means "the night of the 21st".
   */
  eveningOf: Date
  horizon: HorizonInput
}

/**
 * The shootable window for one target on one night, or a stated reason.
 *
 * THE NIGHT IS NAMED BY ITS EVENING, which is the only way a photographer ever
 * says it. "The night of the 21st" is the dark that begins on the 21st and
 * ends on the morning of the 22nd, and a function that took a plain date and
 * quietly used midnight-to-midnight would answer a different question twice.
 */
export function skyWindow(input: SkyWindowInput): SkyWindowResult {
  if (input.at === null) {
    return { kind: 'unknown', reason: 'No venue set, so there is no horizon to compute against' }
  }
  if (!usable(input.eveningOf)) {
    return { kind: 'unknown', reason: 'No date set' }
  }
  const { lat, lon } = input.at
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: 'unknown', reason: 'The venue coordinate is not a number' }
  }
  if (input.target.kind === 'meteors' && showerById(input.target.shower) === null) {
    return { kind: 'unknown', reason: `No shower in the table called ${input.target.shower}` }
  }
  if (input.horizon.kind === 'terrain' && input.horizon.samples.length === 0) {
    /*
     * ASKED FOR TERRAIN, GOT NOTHING. This is the silent fallback the brief
     * refused, so it is an answer with a reason rather than a flat horizon
     * wearing a terrain label.
     */
    return {
      kind: 'unknown',
      reason: 'The terrain horizon was asked for but the elevation data returned no samples',
    }
  }

  const horizonSource: HorizonSource = input.horizon.kind === 'terrain' ? 'terrain' : 'flat'

  /*
   * THE DARK SPAN, FROM EVENT TIMES RATHER THAN AN ALTITUDE THRESHOLD.
   *
   * This suncalc build's getPosition disagrees with its own getTimes by a
   * constant 0.48396 degrees: measured at its own `night` boundary it reports
   * -17.516, not -18. See the long note in nightWindow.ts. Taking the event
   * times makes the printed boundary and the computed band the same fact, and
   * avoids a window whose edge sits two minutes off the time beside it.
   */
  const evening = getTimes(input.eveningOf, lat, lon)
  const nextDay = new Date(input.eveningOf.getTime() + 86_400_000)
  const morning = getTimes(nextDay, lat, lon)

  const darkStart = usable(evening.night) ? evening.night : null
  const darkEnd = usable(morning.nightEnd) ? morning.nightEnd : null

  const emptyConstraints: SkyConstraints = {
    targetUp: null,
    astronomicalDark: null,
    moonDown: null,
  }

  if (darkStart === null || darkEnd === null) {
    return {
      kind: 'none',
      reason: 'The sun never gets 18 degrees below the horizon on this night here',
      constraints: emptyConstraints,
      horizonSource,
    }
  }
  if (darkEnd.getTime() <= darkStart.getTime()) {
    return {
      kind: 'none',
      reason: 'Astronomical dark does not last through this night here',
      constraints: emptyConstraints,
      horizonSource,
    }
  }

  /* Sample the dark span a minute at a time. */
  const times: Date[] = []
  for (let t = darkStart.getTime(); t <= darkEnd.getTime(); t += STEP_MS) {
    times.push(new Date(t))
  }

  const targetFlags: boolean[] = []
  const moonFlags: boolean[] = []
  for (const at of times) {
    const position = targetPosition(input.target, at, lat, lon)
    if (position === null) {
      return { kind: 'unknown', reason: 'The target has no position in the table' }
    }
    targetFlags.push(position.altitude > horizonAngleAt(input.horizon, position.azimuth))
    /*
     * THE MOON IS JUDGED AGAINST THE TRUE HORIZON, NOT THE RIDGE.
     *
     * Deliberate, and the opposite of how the target is judged. A ridge hides
     * the moon's disc but does nothing about its light in the air above the
     * ridge, which is what actually washes out a meteor. Calling it dark
     * because a hill is in the way would be the app overstating, which is the
     * one direction it is never allowed to be wrong in.
     */
    moonFlags.push(moonAltitude(at, lat, lon) < 0)
  }

  const needsMoonDown = input.target.kind !== 'moon'
  const combined = times.map(
    (_, i) => targetFlags[i] === true && (!needsMoonDown || moonFlags[i] === true),
  )

  const constraints: SkyConstraints = {
    targetUp: longestRun(times, targetFlags),
    astronomicalDark: { start: darkStart, end: darkEnd },
    moonDown: needsMoonDown ? longestRun(times, moonFlags) : null,
  }

  const window = longestRun(times, combined)
  if (window === null) {
    const why =
      constraints.targetUp === null
        ? 'The target never clears the horizon while the sky is astronomically dark'
        : needsMoonDown && constraints.moonDown === null
          ? 'The moon is above the horizon for the whole of astronomical dark'
          : 'The target is never up while the sky is dark and the moon is down'
    return { kind: 'none', reason: why, constraints, horizonSource }
  }

  /*
   * WHICH CONSTRAINT SETS EACH EDGE.
   *
   * The edge belongs to whichever constraint changes there. A window starting
   * at the same minute as astronomical dark starts because the sky got dark; a
   * window starting later than that starts because the target rose or the moon
   * set, and which one it is, is exactly the sentence worth printing.
   *
   * The tolerance is one step, because the window is sampled at one-minute
   * resolution and an edge is only ever known to the step it was found in.
   */
  const near = (a: Date, b: Date | undefined): boolean =>
    b !== undefined && Math.abs(a.getTime() - b.getTime()) <= MINUTE

  const startsBecause: BindingConstraint = near(window.start, darkStart)
    ? 'dark'
    : needsMoonDown && near(window.start, constraints.moonDown?.start)
      ? 'moon'
      : 'target'

  const endsBecause: BindingConstraint = near(window.end, darkEnd)
    ? 'dark'
    : needsMoonDown && near(window.end, constraints.moonDown?.end)
      ? 'moon'
      : 'target'

  const middle = new Date((window.start.getTime() + window.end.getTime()) / 2)
  const atMiddle = targetPosition(input.target, middle, lat, lon)

  return {
    kind: 'window',
    window,
    constraints,
    startsBecause,
    endsBecause,
    horizonSource,
    altitudeAtMidWindow: atMiddle?.altitude ?? 0,
  }
}

/** How long a window is, in minutes. */
export function windowMinutes(window: Interval): number {
  return Math.round((window.end.getTime() - window.start.getTime()) / MINUTE)
}

/* ------------------------------------------------------------------- cloud */

/** One hour of the existing cloud forecast. */
export interface CloudHour {
  at: Date
  /** Total cloud cover, percent, or null where the forecast did not say. */
  totalPercent: number | null
}

/**
 * Cloud over a window, or the reason there is none.
 *
 * THREE OUTCOMES, NOT TWO, AND THE THIRD IS THE IMPORTANT ONE. A window beyond
 * the end of the forecast is not a clear window and is not an error: it is a
 * window the forecast does not reach, and saying so is the whole point. The
 * old bug this shape prevents is the one cloud.ts already carries a note
 * about, where a missing percentage became a zero and read as clear sky.
 */
export type CloudOverWindow =
  | { kind: 'hours'; hours: readonly CloudHour[] }
  | { kind: 'out-of-range'; reason: string }

export function cloudForWindow(
  forecast: readonly CloudHour[],
  window: Interval,
): CloudOverWindow {
  const inside = forecast.filter(
    (hour) =>
      usable(hour.at) &&
      hour.at.getTime() >= window.start.getTime() - 3_600_000 &&
      hour.at.getTime() <= window.end.getTime() + 3_600_000,
  )
  if (inside.length === 0) {
    return {
      kind: 'out-of-range',
      reason: 'The cloud forecast does not reach this night',
    }
  }
  return { kind: 'hours', hours: inside }
}

/* --------------------------------------------------------- sky darkness */

import type { SkyDarkness } from './exposure.ts'

/**
 * Which exposure bucket a moment falls in.
 *
 * Coarse on purpose; see the table it keys in exposure.ts. The moon test is
 * "is it up", not "how bright is it", because the table has three rows and a
 * finer question would imply a finer answer than the table can give.
 */
export function skyDarknessAt(at: Date, lat: number, lon: number): SkyDarkness {
  const sun = getPosition(at, lat, lon).altitude
  /*
   * -17.516 rather than -18: this build's getPosition carries the constant
   * +0.48396 degree offset against its own getTimes. Using -18 here would put
   * this function's boundary about two minutes away from the window edge
   * computed above, and the two would disagree on screen.
   */
  if (sun > -17.516) return 'twilight'
  return moonAltitude(at, lat, lon) > 0 ? 'moonlit' : 'astro-dark'
}

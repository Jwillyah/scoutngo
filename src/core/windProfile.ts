/*
 * WIND AT THE HEIGHT YOU ARE FLYING, NOT AT THE GROUND.
 *
 * WHY THIS EXISTS. Every weather app reports wind at ten metres, and at ten
 * metres it is the wrong number for anybody at four hundred feet. Measured at
 * Lynnhaven Inlet for 07:00 on 15 October 2026, from Open-Meteo:
 *
 *   10m    7.5 km/h   from 338
 *   80m   15.1 km/h   from 335
 *   120m  22.1 km/h   from 316
 *   180m  27.0 km/h   from 360
 *
 * The ground said 7.5 and 180 metres said 27.0: three and a half times as
 * much, from a direction twenty-two degrees away. A pilot reading the ground
 * figure is reading a different day.
 *
 * WHAT THIS DOES. Open-Meteo serves four discrete heights. A drone sits
 * between them, so the figure is interpolated, and the panel says it is
 * interpolated rather than measured. 180m is about 590ft, which covers the
 * whole of a Part 107 altitude range, so nothing here extrapolates upward
 * past what the model actually provides.
 *
 * DIRECTION IS INTERPOLATED THE SHORT WAY ROUND. Between 350 and 10 the answer
 * is 0, not 180. Getting that wrong would reverse the wind at exactly the
 * heights where it shears most.
 */

import { normalizeBearing } from './sun.ts'

/** The heights Open-Meteo actually serves, in metres above ground. */
export const WIND_LEVELS_METERS = [10, 80, 120, 180] as const

export type WindLevel = (typeof WIND_LEVELS_METERS)[number]

/** One level's reading. Null where the forecast did not say. */
export interface LevelWind {
  heightMeters: WindLevel
  speedMps: number | null
  fromDegrees: number | null
}

export interface WindAtHeight {
  /** The height asked for, in metres. */
  heightMeters: number
  speedMps: number | null
  fromDegrees: number | null
  /**
   * True when the figure sits between two served levels rather than on one.
   *
   * Said on screen. An interpolated wind is a reasonable number and not a
   * measurement, and the difference is the reader's to weigh.
   */
  interpolated: boolean
  /** Which served heights it came from, so the panel can name them. */
  betweenMeters: [number, number] | [number]
}

/**
 * The shorter way round between two bearings, weighted.
 *
 * `share` 0 gives `a`, 1 gives `b`. Interpolating 350 to 10 the long way would
 * sweep through 180, which is the opposite wind.
 */
export function interpolateBearing(a: number, b: number, share: number): number {
  const from = normalizeBearing(a)
  const to = normalizeBearing(b)
  let delta = to - from
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return normalizeBearing(from + delta * share)
}

/**
 * Wind at an arbitrary height, from the levels the forecast served.
 *
 * CLAMPED, NEVER EXTRAPOLATED. Below the lowest level and above the highest it
 * returns that level's own figure and says it is not interpolated, because
 * guessing beyond the model's range is inventing weather. 180m covers a legal
 * drone ceiling with room to spare, so the upper clamp is a boundary nobody
 * flying under Part 107 reaches.
 *
 * A level with a missing speed or direction is skipped rather than counted as
 * zero: a direction of zero is a confident claim of due north.
 */
export function windAtHeight(levels: readonly LevelWind[], heightMeters: number): WindAtHeight {
  const known = levels
    .filter((l): l is LevelWind & { speedMps: number; fromDegrees: number } =>
      l.speedMps !== null && l.fromDegrees !== null)
    .sort((a, b) => a.heightMeters - b.heightMeters)

  if (known.length === 0) {
    return {
      heightMeters,
      speedMps: null,
      fromDegrees: null,
      interpolated: false,
      betweenMeters: [heightMeters],
    }
  }

  const lowest = known[0]
  const highest = known[known.length - 1]
  if (heightMeters <= lowest.heightMeters) {
    return {
      heightMeters,
      speedMps: lowest.speedMps,
      fromDegrees: lowest.fromDegrees,
      interpolated: false,
      betweenMeters: [lowest.heightMeters],
    }
  }
  if (heightMeters >= highest.heightMeters) {
    return {
      heightMeters,
      speedMps: highest.speedMps,
      fromDegrees: highest.fromDegrees,
      interpolated: false,
      betweenMeters: [highest.heightMeters],
    }
  }

  /*
   * AN EXACT HIT IS A MEASUREMENT, NOT AN INTERPOLATION. Landing on 80m or
   * 120m used to fall through the loop below with a share of 1, which gave the
   * right number with the wrong label on it.
   */
  const exact = known.find((l) => l.heightMeters === heightMeters)
  if (exact !== undefined) {
    return {
      heightMeters,
      speedMps: exact.speedMps,
      fromDegrees: exact.fromDegrees,
      interpolated: false,
      betweenMeters: [exact.heightMeters],
    }
  }

  for (let i = 1; i < known.length; i++) {
    const below = known[i - 1]
    const above = known[i]
    if (heightMeters > above.heightMeters) continue
    const span = above.heightMeters - below.heightMeters
    const share = span === 0 ? 0 : (heightMeters - below.heightMeters) / span
    return {
      heightMeters,
      speedMps: below.speedMps + (above.speedMps - below.speedMps) * share,
      fromDegrees: interpolateBearing(below.fromDegrees, above.fromDegrees, share),
      interpolated: true,
      betweenMeters: [below.heightMeters, above.heightMeters],
    }
  }

  /* Unreachable: the clamps above cover everything outside the loop's range. */
  return {
    heightMeters,
    speedMps: highest.speedMps,
    fromDegrees: highest.fromDegrees,
    interpolated: false,
    betweenMeters: [highest.heightMeters],
  }
}

/** Metres per second to knots, which is how wind is spoken about on the water. */
export const MPS_TO_KNOTS = 1.943844

export function knots(mps: number): number {
  return mps * MPS_TO_KNOTS
}

/**
 * HOW A GUST MEASURES AGAINST AN AIRCRAFT'S RATING. A measurement, not a
 * verdict.
 *
 * The gust is what ends a flight, not the average, so the gust is what is
 * compared. Nothing here says whether to fly: it states the two numbers and
 * which is larger, the same way the Part 107 ceiling is stated. The person
 * holding the controller can see the site and the sky.
 */
export interface AgainstRating {
  gustMps: number
  ratedMps: number
  /** True when the gust exceeds the published rating. Still not a verdict. */
  over: boolean
}

export function compareToRating(
  gustMps: number | null,
  ratedMps: number | null,
): AgainstRating | null {
  if (gustMps === null || ratedMps === null) return null
  return { gustMps, ratedMps, over: gustMps > ratedMps }
}

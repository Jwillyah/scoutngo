/*
 * Does this plan actually cover the subject, or is it six views of the same thing?
 *
 * THE FAILURE THIS EXISTS TO CATCH. Once the model was given the sun's bearing it
 * started placing well lit positions, and then placed ALL of them well lit: two
 * live runs returned six positions each, every one front-lit, every one on the
 * south bank, two of them standing in Riverside Drive. A prompt line saying "do
 * not only do that" did not hold, because nothing measured whether it had.
 *
 * So it is measured here. Coverage is arithmetic over the bearings from the
 * subject to each position, it lives in core with the rest of the arithmetic, and
 * the result is REPORTED. Nothing is rejected and nothing is moved: a clustered
 * plan may be the right answer at a venue with one accessible bank, and the
 * shooter is the one who knows. The tool's job is to refuse to be quiet about it.
 */

import { normalizeBearing } from './sun.ts'

/** Four quadrants around the subject. N-E, E-S, S-W, W-N. */
export const SECTOR_SIZE_DEGREES = 90
export const SECTOR_COUNT = 360 / SECTOR_SIZE_DEGREES

/** A plan touching fewer sectors than this is a cluster, and is called one. */
export const MIN_SECTORS = 3

export const SECTOR_NAMES = ['NE', 'SE', 'SW', 'NW'] as const

/**
 * Positions at or beyond this share of their own standoff ceiling are "parked at
 * the back". A plan where every position is parked at the back has no near work
 * in it, which is a different kind of sameness from the bearing one.
 */
export const NEAR_MAX_STANDOFF_SHARE = 0.8

/**
 * Closer than this to the subject and the bearing means nothing.
 *
 * A position sitting ON the subject has no direction from it: bearingBetween of
 * two identical points is an arbitrary number, not a compass reading. A live run
 * produced exactly this, a deck-rail position placed on the venue pin itself, and
 * its meaningless bearing was being counted as a covered sector. Five metres is
 * inside the noise of a dropped pin anyway.
 *
 * Such a position is EXCLUDED from the coverage arithmetic and said out loud. It
 * is not treated as an error: standing on the subject is a legitimate wide shot,
 * it simply cannot contribute a direction.
 */
export const MIN_BEARING_RANGE_METERS = 5

export interface Coverage {
  /** Bearings FROM the subject TO each position, normalised. */
  bearings: number[]
  /** Indices 0..3 of the quadrants that contain at least one position. */
  occupiedSectors: number[]
  sectorCount: number
  /**
   * How much of the compass the plan actually spans: 360 minus the largest empty
   * gap between adjacent positions. One position spans 0. Positions on exactly
   * opposite sides span 180.
   */
  spreadDegrees: number
  /** Circular mean of the bearings: the direction the majority sits in. */
  dominantBearing: number | null
  /** True when at least one position sits in the opposite half from the mean. */
  hasOppositeSide: boolean
  /** Fewer than MIN_SECTORS quadrants occupied. */
  clustered: boolean
  /** Positions too close to the subject to have a bearing, so left out above. */
  withoutBearing: number
}

export function sectorOf(bearing: number): number {
  return Math.floor(normalizeBearing(bearing) / SECTOR_SIZE_DEGREES) % SECTOR_COUNT
}

/** Smallest angle between two bearings, 0 to 180. */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b))
  return Math.min(d, 360 - d)
}

/**
 * The mean DIRECTION, not the mean number. Averaging 350 and 10 arithmetically
 * gives 180, which points the opposite way from both; the circular mean gives 0.
 */
function circularMean(bearings: number[]): number | null {
  if (bearings.length === 0) return null
  const toRad = Math.PI / 180
  let x = 0
  let y = 0
  for (const b of bearings) {
    x += Math.cos(b * toRad)
    y += Math.sin(b * toRad)
  }
  // Positions in perfect opposition cancel out and have no mean direction.
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null
  return normalizeBearing(Math.atan2(y, x) / toRad)
}

/** 360 minus the biggest empty wedge, which is the arc the plan actually spans. */
function spreadOf(bearings: number[]): number {
  if (bearings.length < 2) return 0
  const sorted = [...bearings].sort((a, b) => a - b)
  let largestGap = 360 - sorted[sorted.length - 1] + sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    largestGap = Math.max(largestGap, sorted[i] - sorted[i - 1])
  }
  return Math.max(0, 360 - largestGap)
}

export function assessCoverage(
  positionBearings: number[],
  withoutBearing = 0,
): Coverage {
  const bearings = positionBearings.map(normalizeBearing)
  const occupiedSectors = [...new Set(bearings.map(sectorOf))].sort((a, b) => a - b)
  const dominantBearing = circularMean(bearings)

  return {
    bearings,
    occupiedSectors,
    sectorCount: occupiedSectors.length,
    spreadDegrees: spreadOf(bearings),
    dominantBearing,
    /*
     * "The opposite side" means the opposite half plane through the subject, so
     * more than 90 degrees off where the majority sits.
     *
     * Each candidate is measured against the mean of the OTHERS, not against the
     * mean of all of them. The circular mean is dragged toward whatever is
     * furthest out, so including the candidate lets it move its own goalposts:
     * two positions at 180 plus one at 300 gives an overall mean of 210, and the
     * outlier then measures exactly 90 degrees away and fails, despite sitting
     * 120 degrees off the pair it is supposed to be opposite.
     */
    hasOppositeSide: bearings.some((bearing, index) => {
      const others = bearings.filter((_, j) => j !== index)
      const majority = circularMean(others)
      // No majority to be opposite of means the plan is already balanced.
      return majority === null || angularDistance(bearing, majority) > 90
    }),
    clustered: occupiedSectors.length < MIN_SECTORS,
    withoutBearing,
  }
}

export interface RangeSample {
  rangeMeters: number
  /** This position's own standoff ceiling, which depends on its focal length. */
  maxStandoffMeters: number
}

export interface RangeVariety {
  minMeters: number
  maxMeters: number
  /** Every position sitting at or past NEAR_MAX_STANDOFF_SHARE of its ceiling. */
  allNearMaxStandoff: boolean
}

export function assessRangeVariety(samples: RangeSample[]): RangeVariety {
  if (samples.length === 0) {
    return { minMeters: 0, maxMeters: 0, allNearMaxStandoff: false }
  }
  const ranges = samples.map((s) => s.rangeMeters)
  return {
    minMeters: Math.min(...ranges),
    maxMeters: Math.max(...ranges),
    // One position at the back is a choice. Every position at the back is a habit.
    allNearMaxStandoff:
      samples.length > 1 &&
      samples.every(
        (s) =>
          s.maxStandoffMeters > 0 &&
          s.rangeMeters >= s.maxStandoffMeters * NEAR_MAX_STANDOFF_SHARE,
      ),
  }
}

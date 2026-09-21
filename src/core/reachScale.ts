/*
 * The reach SLIDER's scale. How a thumb position becomes a distance.
 *
 * WHY THIS IS SEPARATE FROM radius.ts. That file owns what reach MEANS: the
 * floor, the ceiling, the clamp, and the in-or-out test every returned position
 * is checked against. None of that changes because the control changed. This
 * file owns only the mapping between a slider position and a number of metres,
 * which is a property of the control and of nothing else.
 *
 * WHY THE SCALE IS PIECEWISE AND NOT LINEAR. Linear from 25m to 2000m spends
 * four fifths of the track on distances nobody picks. The useful answers cluster
 * low: inside a venue, across a car park, across a marina. Anchoring the stops
 * at equal intervals along the track gives every useful distance the same amount
 * of thumb travel, and leaves the long tail to the last sixth where it belongs.
 */

import { RADIUS_MAX_METERS, RADIUS_MIN_METERS, clampRadius } from './radius.ts'

/**
 * The distances worth landing on exactly.
 *
 * 100 is inside one venue. 250 is across a car park or a marina basin. 400 is
 * the default, about a five minute walk. 750 is the far bank of most of the
 * rivers this is used on. 1500 is a drone's practical visual line of sight.
 */
export const REACH_STOPS = [100, 250, 400, 750, 1500] as const

/**
 * The anchors the track is built from: the floor, every stop, the ceiling.
 * Seven anchors, six equal segments, so each stop sits at a sixth of the track.
 */
const ANCHORS: number[] = [RADIUS_MIN_METERS, ...REACH_STOPS, RADIUS_MAX_METERS]
const SEGMENTS = ANCHORS.length - 1

/**
 * How close to a stop the thumb has to be to land on it, as a fraction of the
 * whole track. About a third of a segment: close enough that reaching for 400
 * gets exactly 400, far enough that 300 is still selectable.
 */
export const SNAP_WITHIN = 0.055

/** Integer positions the range input reports, so the DOM value stays exact. */
export const SLIDER_MAX = 1000

const clamp01 = (t: number) => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0)

/** Slider position in [0,1] to a distance in metres. */
export function metersAtPosition(position: number): number {
  const t = clamp01(position) * SEGMENTS
  const index = Math.min(SEGMENTS - 1, Math.floor(t))
  const withinSegment = t - index
  const from = ANCHORS[index]
  return from + withinSegment * (ANCHORS[index + 1] - from)
}

/** The inverse: a distance in metres back to a slider position in [0,1]. */
export function positionForMeters(meters: number): number {
  const m = clampRadius(meters)
  for (let i = 0; i < SEGMENTS; i++) {
    const from = ANCHORS[i]
    const to = ANCHORS[i + 1]
    if (m <= to) return (i + (m - from) / (to - from)) / SEGMENTS
  }
  return 1
}

/**
 * The distance for a thumb position, pulled onto a stop when it is close.
 *
 * SMOOTH BETWEEN, EXACT ON. The magnet is applied to the POSITION rather than to
 * the metres, so the pull is the same physical distance in thumb travel at every
 * part of the track. Snapping in metres would make the top of the track sticky
 * for hundreds of metres and the bottom barely sticky at all.
 */
export function snappedMetersAt(position: number): number {
  const t = clamp01(position)
  for (let i = 1; i <= REACH_STOPS.length; i++) {
    if (Math.abs(t - i / SEGMENTS) <= SNAP_WITHIN) return REACH_STOPS[i - 1]
  }
  return clampRadius(metersAtPosition(t))
}

/** Where each stop sits along the track, for drawing the tick marks. */
export function stopPositions(): number[] {
  return REACH_STOPS.map((_, i) => (i + 1) / SEGMENTS)
}

export const FEET_PER_METER = 3.280839895

export function metersToFeet(meters: number): number {
  return meters * FEET_PER_METER
}

/**
 * The readout, in both units.
 *
 * BOTH, ALWAYS. This is used by someone who thinks in feet standing next to a
 * map that thinks in metres, and the conversion is exactly the kind of thing
 * nobody should be doing in their head on a jetty.
 */
export function formatReach(meters: number): { metric: string; imperial: string } {
  const m = clampRadius(meters)
  // Trailing zeros stripped: 1.50 reads as false precision on a number the
  // shooter picked off a five-stop slider.
  const metric =
    m < 1000 ? `${m} m` : `${(m / 1000).toFixed(2).replace(/\.?0+$/, '')} km`
  const feet = Math.round(metersToFeet(m))
  return { metric, imperial: `${feet.toLocaleString('en-US')} ft` }
}

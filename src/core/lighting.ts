/**
 * AUTHORITY FILE. This module is the single source of truth for lighting.
 *
 * Whether a position is backlit, front-lit, or side-lit is decided here, by
 * arithmetic, and nowhere else. Model output never overrides it. The model is
 * allowed to propose where to stand and what to shoot; it is not allowed to say
 * how that position is lit. If a model response contains a lighting claim, it is
 * discarded and recomputed by classifyLighting.
 *
 * The prototype that preceded this project asked a model for lighting direction
 * and it was wrong on half the positions, including calling a camera pointing at
 * 135 degrees with the sun at 134 degrees "front-lit". That case is pinned in
 * lighting.test.ts and is the reason this file exists.
 *
 * Keep every function here pure and dependency free apart from suncalc.
 */

import { getSunPosition, normalizeBearing, type SunPosition } from './sun.ts'

export type Classification = 'backlit' | 'front-lit' | 'side-lit'

export interface LightingResult {
  classification: Classification
  /** Angular separation between where the camera points and where the sun is, 0-180. */
  delta: number
  /** Compass bearing the camera is pointing: (positionBearing + 180) % 360. */
  cameraBearing: number
}

export type AltitudeNote =
  | 'low sun, long shadows, flare risk'
  | 'flat overhead light'
  | 'workable'

/**
 * `positionBearing` is measured FROM the venue TO the camera position.
 * The camera looks back at the venue, so it points the opposite way.
 * Small delta means the camera is aimed at the sun: backlit.
 */
export function classifyLighting(positionBearing: number, sunAzimuth: number): LightingResult {
  const cameraBearing = normalizeBearing(positionBearing + 180)
  const d = Math.abs(cameraBearing - normalizeBearing(sunAzimuth))
  const delta = Math.min(d, 360 - d)

  let classification: Classification
  if (delta < 45) classification = 'backlit'
  else if (delta > 135) classification = 'front-lit'
  else classification = 'side-lit'

  return { classification, delta, cameraBearing }
}

export function altitudeNote(altitude: number): AltitudeNote {
  if (altitude < 15) return 'low sun, long shadows, flare risk'
  if (altitude > 60) return 'flat overhead light'
  return 'workable'
}

export interface WindowSample {
  at: Date
  sun: SunPosition
  lighting: LightingResult
  altitudeNote: AltitudeNote
}

export interface WindowEvaluation {
  start: WindowSample
  middle: WindowSample
  end: WindowSample
  /** True when the classification is not identical at all three samples. */
  flips: boolean
}

function sample(positionBearing: number, lat: number, lon: number, at: Date): WindowSample {
  const sun = getSunPosition(at, lat, lon)
  return {
    at,
    sun,
    lighting: classifyLighting(positionBearing, sun.azimuth),
    altitudeNote: altitudeNote(sun.altitude),
  }
}

/**
 * A four hour window can flip from backlit to front-lit, so each end and the
 * midpoint are classified separately rather than averaged.
 */
export function evaluateWindow(
  positionBearing: number,
  lat: number,
  lon: number,
  startDate: Date,
  endDate: Date,
): WindowEvaluation {
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2)

  const start = sample(positionBearing, lat, lon, startDate)
  const middle = sample(positionBearing, lat, lon, midDate)
  const end = sample(positionBearing, lat, lon, endDate)

  const flips =
    start.lighting.classification !== middle.lighting.classification ||
    middle.lighting.classification !== end.lighting.classification

  return { start, middle, end, flips }
}

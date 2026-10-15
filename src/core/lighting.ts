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
 *
 * IT ALSO REFUSES. A lighting class is a statement about where the camera is
 * pointing relative to the sun, and two of the three shot types do not point
 * the camera at anything: a 360 sees every direction and a top-down sees the
 * ground. There is no bearing to classify, and inventing one would put a
 * number nothing measured into the one file that is supposed to be the
 * authority.
 *
 * So the public entry point takes an Aim rather than a number. The arithmetic
 * that needs a bearing is a PRIVATE function in this module, and the only way
 * to reach it is through an aim whose shot type actually has one. A caller
 * holding a 360 position has no bearing field to pass, so the mistake is not
 * available to make. lighting.test.ts asserts that export surface, because the
 * gate is the absence of a numeric entry point and an absence is easy to
 * undo by accident.
 */

import type { Aim, ShotType } from './shotType.ts'
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
 * THE ARITHMETIC, AND IT IS PRIVATE.
 *
 * `positionBearing` is measured FROM the venue TO the camera position. The
 * camera looks back at the venue, so it points the opposite way. Small delta
 * means the camera is aimed at the sun: backlit.
 *
 * Not exported. This is the structural half of the refusal: a bearing cannot
 * reach this function except through an aim that has one.
 */
function classifyFromPositionBearing(
  positionBearing: number,
  sunAzimuth: number,
): LightingResult {
  const cameraBearing = normalizeBearing(positionBearing + 180)
  const d = Math.abs(cameraBearing - normalizeBearing(sunAzimuth))
  const delta = Math.min(d, 360 - d)

  let classification: Classification
  if (delta < 45) classification = 'backlit'
  else if (delta > 135) classification = 'front-lit'
  else classification = 'side-lit'

  return { classification, delta, cameraBearing }
}

/*
 * HOW LONG A SHADOW IS, AS A MULTIPLE OF WHAT CASTS IT.
 *
 * length = height / tan(altitude). This is the whole read on a nadir shot: a
 * top-down at a low sun is a picture OF the shadows, and the number that says
 * how good it will be is how many times its own height everything is throwing.
 *
 * Null when the sun is at or below the horizon, because there is no shadow to
 * measure, not because something went wrong.
 */
export function shadowLengthRatio(sunAltitude: number): number | null {
  if (sunAltitude <= 0) return null
  return 1 / Math.tan((sunAltitude * Math.PI) / 180)
}

export type ShadowLength = 'none' | 'short' | 'medium' | 'long' | 'raking'

/**
 * Bands on that ratio, because "4.2x" means less at a glance than "long".
 *
 * raking at 6x and beyond, which is the sun under about 9.5 degrees. That is
 * the band a nadir shadow shot is actually chasing, and it is a different
 * statement from merely long.
 */
export function shadowLength(sunAltitude: number): ShadowLength {
  const ratio = shadowLengthRatio(sunAltitude)
  if (ratio === null) return 'none'
  if (ratio >= 6) return 'raking'
  if (ratio >= 3) return 'long'
  if (ratio >= 1) return 'medium'
  return 'short'
}

export type FlareRisk = 'none' | 'moderate' | 'high'

/**
 * Flare risk on a shot that cannot avoid the sun.
 *
 * A 360 has the sun in frame whenever it is up: that is not a fault, it is the
 * geometry. So the risk is about how LOW it is, because a low sun sits in the
 * part of the frame where the stitch lines and the lens coatings are worst.
 */
export function flareRisk(sunAltitude: number): FlareRisk {
  if (sunAltitude <= 0) return 'none'
  if (sunAltitude < 15) return 'high'
  if (sunAltitude < 30) return 'moderate'
  return 'none'
}

/**
 * WHAT IS TRUE ABOUT THE LIGHT AT THIS POSITION.
 *
 * One variant per shot type, carrying only what that type actually has. A
 * `framed` read has a classification; the other two do not have the field at
 * all, so no card, list or pack can print a lighting class for a 360 even by
 * mistake.
 *
 * Each of the other two says what IS true instead, which is the point. A
 * top-down is about shadow direction and length. A 360 is about where the sun
 * sits on the horizon ring and whether it is low enough to flare.
 */
export type LightingRead =
  | {
      shotType: 'framed'
      /** Which way the camera points, and how that sits against the sun. */
      lighting: LightingResult
    }
  | {
      shotType: 'top-down'
      /** Which way shadows fall across the frame. */
      shadowBearing: number
      /** How many times its own height a thing throws, or null below the horizon. */
      shadowLengthRatio: number | null
      shadowLength: ShadowLength
      /** Which way the rectangle is turned. NOT a camera bearing. */
      yawDegrees: number
      /**
       * Angle between the shadows and the frame's own long axis, 0 to 90.
       * Zero means the shadows run straight along the frame.
       */
      shadowAgainstFrame: number | null
    }
  | {
      shotType: 'orbit'
      /** Where the sun sits on the horizon ring, as a compass bearing. */
      sunBearing: number
      /** How far above or below the ring it is. Negative is below. */
      sunAltitude: number
      flareRisk: FlareRisk
    }

/**
 * Why there is no lighting class, in a sentence, for the UI to print.
 *
 * The UI must SAY why rather than show a blank or a dash, because a blank
 * where a classification used to be reads as a broken app.
 */
export const NO_CLASS_REASON: Record<Exclude<ShotType, 'framed'>, string> = {
  'top-down':
    'No lighting class: the camera points at the ground, so there is no bearing to compare with the sun.',
  orbit:
    'No lighting class: the camera sees every direction at once, so there is no one bearing to compare with the sun.',
}

/**
 * THE ONE ENTRY POINT, and it takes an Aim.
 *
 * There is deliberately no overload taking a bare bearing. That is the gate:
 * a position whose shot type has no bearing cannot supply one.
 */
export function classifyLighting(aim: Aim, sun: SunPosition): LightingRead {
  /*
   * AND IT FAILS LOUDLY ON ANYTHING ELSE.
   *
   * The type is the gate for code in this repo, and that is most of the
   * protection. It is not all of it: a field pack is JSON out of localStorage,
   * so an aim CAN arrive at runtime from outside the type system, either from
   * an older build or from a file somebody edited. Without this the switch
   * below would match no case and hand back undefined, and a position would
   * render with no light read at all for no stated reason.
   *
   * Throwing rather than returning a default, because there is no honest
   * default: every branch below is a claim about the geometry, and guessing
   * which one applies is the exact mistake this whole shape exists to prevent.
   */
  const shotType: unknown = (aim as { shotType?: unknown } | null)?.shotType
  if (shotType !== 'framed' && shotType !== 'top-down' && shotType !== 'orbit') {
    throw new TypeError(
      `classifyLighting needs an Aim, not ${typeof aim}. ` +
        'A camera bearing cannot be passed directly: see src/core/shotType.ts.',
    )
  }

  switch (aim.shotType) {
    case 'framed':
      return {
        shotType: 'framed',
        lighting: classifyFromPositionBearing(aim.positionBearing, sun.azimuth),
      }
    case 'top-down': {
      const ratio = shadowLengthRatio(sun.altitude)
      /*
       * The frame is a rectangle, so its long axis repeats every 180 degrees:
       * shadows at 10 degrees to it and at 170 are the same picture. Folded to
       * 0..90 so the number means "how far off square", not a bearing.
       */
      const raw = Math.abs(normalizeBearing(sun.shadowBearing) - normalizeBearing(aim.yawDegrees))
      const folded = raw % 180
      return {
        shotType: 'top-down',
        shadowBearing: normalizeBearing(sun.shadowBearing),
        shadowLengthRatio: ratio,
        shadowLength: shadowLength(sun.altitude),
        yawDegrees: normalizeBearing(aim.yawDegrees),
        shadowAgainstFrame: ratio === null ? null : Math.min(folded, 180 - folded),
      }
    }
    case 'orbit':
      return {
        shotType: 'orbit',
        sunBearing: normalizeBearing(sun.azimuth),
        sunAltitude: sun.altitude,
        flareRisk: flareRisk(sun.altitude),
      }
  }
}

/**
 * The classification, or null when this shot type has none.
 *
 * A convenience for the places that genuinely only want the word, so they do
 * not each write their own switch and get the non-framed case wrong.
 */
export function classificationOf(read: LightingRead): Classification | null {
  return read.shotType === 'framed' ? read.lighting.classification : null
}

export function altitudeNote(altitude: number): AltitudeNote {
  if (altitude < 15) return 'low sun, long shadows, flare risk'
  if (altitude > 60) return 'flat overhead light'
  return 'workable'
}

export interface WindowSample {
  at: Date
  sun: SunPosition
  /** Whatever is true about the light here, which depends on the shot type. */
  read: LightingRead
  altitudeNote: AltitudeNote
}

export interface WindowEvaluation {
  start: WindowSample
  middle: WindowSample
  end: WindowSample
  /**
   * True when the classification is not identical at all three samples. Always
   * false for a shot type with no classification.
   */
  flips: boolean
}

function sample(aim: Aim, lat: number, lon: number, at: Date): WindowSample {
  const sun = getSunPosition(at, lat, lon)
  return { at, sun, read: classifyLighting(aim, sun), altitudeNote: altitudeNote(sun.altitude) }
}

/**
 * A four hour window can flip from backlit to front-lit, so each end and the
 * midpoint are classified separately rather than averaged.
 */
export function evaluateWindow(
  aim: Aim,
  lat: number,
  lon: number,
  startDate: Date,
  endDate: Date,
): WindowEvaluation {
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2)

  const start = sample(aim, lat, lon, startDate)
  const middle = sample(aim, lat, lon, midDate)
  const end = sample(aim, lat, lon, endDate)

  /*
   * Only a framed shot can flip, because only a framed shot has a class to
   * flip between. A 360 at the start of the window and a 360 at the end of it
   * are the same 360.
   */
  const classes = [start, middle, end].map((s) => classificationOf(s.read))
  const flips = classes[0] !== classes[1] || classes[1] !== classes[2]

  return { start, middle, end, flips }
}

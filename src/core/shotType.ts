/*
 * WHAT KIND OF SHOT A POSITION IS, AND THEREFORE WHAT GEOMETRY IT HAS.
 *
 * Every position in this app used to assume a bearing. You stand somewhere,
 * the camera looks back at the pin, and lighting is classified from that
 * camera bearing against the sun's azimuth. That is true of a framed shot and
 * it is not true of anything else.
 *
 * A 360 has no bearing: the camera sees every direction at once. A top-down
 * has no bearing either: it points at the ground, and the yaw only decides
 * which way the RECTANGLE is turned, not what the camera is aimed at. Handing
 * either of those a made up bearing would put a number into the lighting
 * authority that nothing measured, which is the same class of mistake as a
 * coordinate falling back to Null Island or a Sony lens standing in for a
 * drone camera.
 *
 * So the bearing is not a field that every position carries. It lives inside
 * Aim, which is a different shape per shot type, and a shot type that has no
 * bearing has no field to read one out of. That is the whole design: the
 * refusal is in the types, not in a runtime check somebody can forget.
 *
 * THERE IS ALREADY A PRECEDENT for a position with no usable bearing. A
 * position standing on top of the subject is excluded from the coverage
 * arithmetic and said out loud, because "standing on the subject is a
 * legitimate wide shot, it simply cannot contribute a direction"
 * (src/core/coverage.ts). Top-down and 360 join that path rather than
 * inventing a second one.
 */

/**
 * FRAMED is what this app has always done and stays the default. A client
 * event shoot uses nothing else and must look exactly as it did.
 */
export type ShotType = 'framed' | 'top-down' | 'orbit'

export const DEFAULT_SHOT_TYPE: ShotType = 'framed'

/** In the order the picker offers them, the default first. */
export const SHOT_TYPES: readonly ShotType[] = ['framed', 'top-down', 'orbit'] as const

export const SHOT_TYPE_LABEL: Record<ShotType, string> = {
  framed: 'Framed',
  'top-down': 'Top-down',
  orbit: '360',
}

/** One line each, for the picker. What the camera is doing, not what it is for. */
export const SHOT_TYPE_NOTE: Record<ShotType, string> = {
  framed: 'Camera aimed at the pin. Lighting is classified from that bearing.',
  'top-down': 'Camera straight down. No bearing, so no lighting class: shadows are the read.',
  orbit: 'Camera sees every direction. No bearing, so no lighting class.',
}

/**
 * THE AIM OF A POSITION. A different shape per shot type, on purpose.
 *
 * `framed` carries `positionBearing`, measured FROM the subject TO the
 * position, which is what the lighting arithmetic wants. The camera looks back
 * the opposite way.
 *
 * `top-down` carries `yawDegrees`, which is NOT a look direction. The camera
 * points at the ground whatever the yaw is; the yaw turns the rectangle the
 * sensor lays on the ground. It is here so the frame can be lined up with the
 * shadows, and it must never be read as a camera bearing.
 *
 * `orbit` carries nothing. There is nothing to carry.
 */
export type Aim =
  | {
      shotType: 'framed'
      /** FROM the subject TO the position. What the lighting arithmetic wants. */
      positionBearing: number
      /**
       * FROM the position TO the subject. Where the camera actually points.
       *
       * BOTH ARE MEASURED, neither is derived from the other. They are not
       * exactly 180 apart: on a sphere the forward and reverse azimuths
       * between two points differ by the convergence of the meridians between
       * them, measured at 2.7e-3 degrees over 400m east at this latitude and
       * written to measurements/2026-10-18-derivations.md.
       *
       * THIS COMMENT SAID 6e-5 AND WAS WRONG BY A FACTOR OF 45. The textbook
       * convergence is the longitude difference times sin(latitude), which
       * for 400 m east at 36.9 N is 0.004494 x 0.6004 = 2.70e-3 degrees. The
       * re-derivation and an independent hand calculation agree. Nothing in
       * the app behaved differently because of it -- the point was never the
       * size of the number, only that it is not zero -- but it was a number
       * in a comment that nobody could check, and it was wrong.
       * Tiny, but deriving one from the other would mean the bearing shown on
       * the card and sent to Street View was an approximation of a number
       * turf could have given exactly.
       */
      cameraBearing: number
    }
  | { shotType: 'top-down'; yawDegrees: number }
  | { shotType: 'orbit' }

/** Default yaw for a new top-down. North up, because that is what a map is. */
export const DEFAULT_YAW_DEGREES = 0

/**
 * Whether this shot type aims the camera at anything.
 *
 * Read this rather than comparing against a list of types in two places. It is
 * also the honest name for the question: it is not "is this framed", it is
 * "does a camera bearing exist", and the answer is what the lighting authority
 * turns on.
 */
export function hasCameraBearing(shotType: ShotType): boolean {
  return shotType === 'framed'
}

/**
 * The camera bearing, or null when the shot type does not have one.
 *
 * The ONLY way to get a camera bearing out of an aim. Returning null rather
 * than throwing because the absence is a normal state, not a failure: a 360 is
 * not a broken framed shot.
 */
export function cameraBearingOf(aim: Aim): number | null {
  return aim.shotType === 'framed' ? aim.cameraBearing : null
}

/**
 * Whether a cone toward the subject describes what this position sees.
 *
 * Only a framed shot. A top-down sees a rectangle on the ground and a 360 sees
 * everything, and drawing either as a cone would be drawing a claim about a
 * direction that does not exist.
 */
export function drawsCone(shotType: ShotType): boolean {
  return shotType === 'framed'
}

/**
 * What the pin IS for this shot type.
 *
 * For a framed shot it is the subject: the thing the camera is aimed at. For
 * the other two it is a place the aircraft is, and the camera is not pointed at
 * it in any sense. Saying so is the difference between a tool that knows what
 * it is measuring and one that quietly treats every pin the same.
 */
export const PIN_ROLE: Record<ShotType, string> = {
  framed: 'the subject, and the camera is aimed at it',
  'top-down': 'the point the camera is directly above',
  orbit: 'where the aircraft is, not what is being shot',
}

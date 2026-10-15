/**
 * Adding, removing, duplicating and reordering camera positions.
 *
 * MANUAL PLACEMENT IS THE PRIMARY WAY TO BUILD A PLAN. Suggestion is a
 * convenience that has never placed well enough to trust; a shooter who knows
 * the spot is faster and right. So these are not helpers around the edge of a
 * generate, they are the main path, and every one of them is pure so the rule
 * can be tested without a map.
 *
 * NUMBERS ARE POSITIONAL, NOT IDENTITY. The badge on the map is "the third one
 * in the list", so it is recomputed after every change. The id is identity and
 * never changes, which is what the card, the selection and the field pager all
 * hold on to.
 */

import { clampAltitudeFeet, DEFAULT_ALTITUDE_FEET, usesAltitude } from '../core/air.ts'
import {
  DEFAULT_SHOT_TYPE,
  DEFAULT_YAW_DEGREES,
  type ShotType,
} from '../core/shotType.ts'
import type { LatLon } from '../core/geo.ts'
import type { KitProfile } from '../core/kit.ts'
import { focalOn, platformOptics } from '../core/optics.ts'
import type { CameraPosition, PositionOrigin } from './plan.ts'

/** A plan longer than this is a list nobody reads on a phone in the field. */
export const MAX_POSITIONS = 12

/** Badges run 1..n in list order, always. */
export function renumber(list: CameraPosition[]): CameraPosition[] {
  return list.map((position, index) => ({ ...position, number: index + 1 }))
}

let counter = 0

/** Ids only have to be unique within a session's plan, and stable across edits. */
export function newPositionId(): string {
  counter += 1
  return `m${Date.now().toString(36)}${counter.toString(36)}`
}

export interface NewPosition {
  at: LatLon
  lensId: string
  focalLength: number
  platform?: 'ground' | 'air'
  altitudeFeet?: number
  shotType?: ShotType
  yawDegrees?: number
  origin?: PositionOrigin
}

/**
 * A position the shooter placed.
 *
 * The prose fields are left EMPTY rather than filled with a placeholder. The
 * shot text is the one thing a model ever writes, and inventing "Position 4"
 * here would put words on a card that read like a plan and mean nothing.
 */
export function addPosition(list: CameraPosition[], next: NewPosition): CameraPosition[] {
  if (list.length >= MAX_POSITIONS) return list
  const position: CameraPosition = {
    id: newPositionId(),
    number: list.length + 1,
    at: next.at,
    lensId: next.lensId,
    focalLength: Math.round(next.focalLength),
    shot: '',
    risk: '',
    angleRationale: '',
    coversShot: null,
    platform: next.platform ?? 'ground',
    altitudeFeet: next.altitudeFeet ?? 0,
    /*
     * FRAMED BY DEFAULT, always. A client event shoot uses nothing else, and
     * the other two must never arrive without being chosen.
     */
    shotType: next.shotType ?? DEFAULT_SHOT_TYPE,
    yawDegrees: next.yawDegrees ?? DEFAULT_YAW_DEGREES,
    moved: false,
    origin: next.origin ?? 'manual',
  }
  return renumber([...list, position])
}

export function removePosition(list: CameraPosition[], id: string): CameraPosition[] {
  return renumber(list.filter((position) => position.id !== id))
}

/**
 * The same spot, a fresh id, dropped in directly after the original.
 *
 * THIS IS THE "TRY ANOTHER LENS" MOVE. Standing in one place and wanting to know
 * what 200mm does instead of 600mm is the common question, and the answer is a
 * second position on the same coordinate rather than an edit that throws the
 * first away. It is a MANUAL position whatever it was copied from: the shooter
 * chose to make it.
 */
export function duplicatePosition(list: CameraPosition[], id: string): CameraPosition[] {
  const index = list.findIndex((position) => position.id === id)
  if (index === -1 || list.length >= MAX_POSITIONS) return list
  const copy: CameraPosition = {
    ...list[index],
    id: newPositionId(),
    origin: 'manual',
    moved: false,
  }
  return renumber([...list.slice(0, index + 1), copy, ...list.slice(index + 1)])
}

/** Moves one position through the list. Clamped: the ends are not wrap-arounds. */
export function movePosition(
  list: CameraPosition[],
  id: string,
  delta: number,
): CameraPosition[] {
  const from = list.findIndex((position) => position.id === id)
  if (from === -1) return list
  const to = from + delta
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return renumber(next)
}

/**
 * Changes the camera height.
 *
 * Clamped in core, to the same bounds the model's answer is clamped to, so a
 * typed 900 and a proposed 900 both become 400.
 *
 * THE GUARD IS ABOUT THE GEOMETRY, NOT THE PLATFORM. It used to refuse any
 * ground position, on the grounds that an altitude on something standing on
 * the ground is a contradiction. That stopped being true when shot types
 * arrived: a top-down's ground rectangle and a 360's horizon ring are both
 * sized from the camera's height whatever it is standing on, so refusing to
 * set it left those shapes sized from a floor the shooter could not move. A
 * framed ground position still has no use for it and is still left alone.
 */
export function setAltitude(
  list: CameraPosition[],
  id: string,
  altitudeFeet: number,
): CameraPosition[] {
  return list.map((position) =>
    position.id === id && usesAltitude(position.platform, position.shotType)
      ? { ...position, altitudeFeet: clampAltitudeFeet(altitudeFeet) }
      : position,
  )
}

/**
 * Changes the glass on one position. Everything downstream recomputes from it.
 *
 * IT REFUSES AN OPTIC THE PLATFORM CANNOT CARRY. Not clamps, not ignores:
 * throws, because by the time this is called the picker has already narrowed
 * its options to the platform's own optics (see core/optics.ts) and the only
 * way to arrive here with a mismatch is a caller that built its own list.
 * The same treatment classifyLighting gives a camera bearing on a 360: the
 * invalid state is refused at the boundary rather than carried inward and
 * quietly computed with.
 *
 * The focal length is clamped to what the optic can produce, so a drone camera
 * cannot be set to a focal length the aircraft has no lens for.
 */
export function setOptic(
  list: CameraPosition[],
  kit: KitProfile,
  id: string,
  lensId: string,
  focalLength: number,
): CameraPosition[] {
  return list.map((position) => {
    if (position.id !== id) return position
    const optic = platformOptics(position.platform, kit).find((o) => o.id === lensId)
    if (optic === undefined) {
      throw new Error(
        `setOptic: ${lensId} is not an optic a ${position.platform} position can carry`,
      )
    }
    return { ...position, lensId, focalLength: focalOn(optic, focalLength) }
  })
}

/**
 * Changes what kind of shot a position is.
 *
 * Going to a shot type whose geometry needs a camera height gives it the
 * default rather than leaving it at zero, because a rectangle or a ring sized
 * from zero has no size at all.
 *
 * Switching AWAY from top-down leaves the yaw where it was rather than zeroing
 * it, so flipping to 360 to look and back again does not lose the angle that
 * was lined up with the shadows.
 */
export function setShotType(
  list: CameraPosition[],
  id: string,
  shotType: ShotType,
): CameraPosition[] {
  return list.map((position) => {
    if (position.id !== id) return position
    const needsHeight = usesAltitude(position.platform, shotType)
    return {
      ...position,
      shotType,
      altitudeFeet:
        needsHeight && position.altitudeFeet <= 0
          ? DEFAULT_ALTITUDE_FEET
          : position.altitudeFeet,
    }
  })
}

/** Turns the top-down rectangle. Normalised, because a yaw of 370 is a yaw of 10. */
export function setYaw(list: CameraPosition[], id: string, yawDegrees: number): CameraPosition[] {
  const normalised = ((yawDegrees % 360) + 360) % 360
  return list.map((position) =>
    position.id === id ? { ...position, yawDegrees: Math.round(normalised) } : position,
  )
}

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

import { clampAltitudeFeet } from '../core/air.ts'
import type { LatLon } from '../core/geo.ts'
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
 * Changes how high an air position is flying.
 *
 * Clamped in core, to the same bounds the model's answer is clamped to, so a
 * typed 900 and a proposed 900 both become 400. Ground positions are left
 * alone: an altitude on something standing on the ground is not a number, it
 * is a contradiction.
 */
export function setAltitude(
  list: CameraPosition[],
  id: string,
  altitudeFeet: number,
): CameraPosition[] {
  return list.map((position) =>
    position.id === id && position.platform === 'air'
      ? { ...position, altitudeFeet: clampAltitudeFeet(altitudeFeet) }
      : position,
  )
}

/** Changes the glass on one position. Everything downstream recomputes from it. */
export function setOptic(
  list: CameraPosition[],
  id: string,
  lensId: string,
  focalLength: number,
): CameraPosition[] {
  return list.map((position) =>
    position.id === id
      ? { ...position, lensId, focalLength: Math.round(focalLength) }
      : position,
  )
}

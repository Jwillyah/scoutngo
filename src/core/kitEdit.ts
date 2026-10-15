/**
 * Editing the kit: adding and removing bodies, lenses and drones.
 *
 * WHY THIS IS CORE AND NOT A FORM. Every number on every card is computed from
 * these values. A lens with its focal range typed in backwards does not produce
 * a slightly wrong label, it produces a wrong field of view, a wrong frame
 * width, a wrong standoff band and a wrong multiple against the subject size,
 * all of which look exactly as confident as the right ones.
 *
 * So the numbers are validated here, in one place, with tests, and the form
 * upstairs only renders what this says.
 */

import type { Body, Drone, DroneCamera, KitProfile, Lens } from './kit.ts'
import type { SensorName } from './fov.ts'

/** Beyond these a value is a typo, not a lens. */
export const FOCAL_MIN = 1
export const FOCAL_MAX = 2000
export const WEIGHT_MIN_GRAMS = 50
export const WEIGHT_MAX_GRAMS = 25_000
export const MAX_DRONE_CAMERAS = 4

export type FieldErrors = Record<string, string>

const trimmed = (value: string) => value.trim()

/** Slug from a name, with a suffix so two "70-200" lenses cannot collide. */
export function kitId(prefix: string, name: string, taken: readonly string[]): string {
  const base =
    trimmed(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'item'
  let id = `${prefix}-${base}`
  let n = 2
  while (taken.includes(id)) {
    id = `${prefix}-${base}-${n}`
    n += 1
  }
  return id
}

export interface LensDraft {
  name: string
  minFocalLength: string
  maxFocalLength: string
  apscOnly: boolean
}

/**
 * A lens is only usable if its focal range is a real range.
 *
 * A prime is min === max, which is legitimate and must pass. Reversed is not: a
 * "70-200" entered as 200 to 70 would compute a negative span everywhere it is
 * used, and nothing downstream checks for that because nothing downstream
 * should have to.
 */
export function validateLens(draft: LensDraft): FieldErrors {
  const errors: FieldErrors = {}
  if (trimmed(draft.name) === '') errors.name = 'Name it so you can pick it later.'

  const min = Number(draft.minFocalLength)
  const max = Number(draft.maxFocalLength)

  if (draft.minFocalLength.trim() === '' || !Number.isFinite(min)) {
    errors.minFocalLength = 'Required.'
  } else if (min < FOCAL_MIN || min > FOCAL_MAX) {
    errors.minFocalLength = `Between ${FOCAL_MIN} and ${FOCAL_MAX}mm.`
  }

  if (draft.maxFocalLength.trim() === '' || !Number.isFinite(max)) {
    errors.maxFocalLength = 'Required.'
  } else if (max < FOCAL_MIN || max > FOCAL_MAX) {
    errors.maxFocalLength = `Between ${FOCAL_MIN} and ${FOCAL_MAX}mm.`
  }

  if (
    errors.minFocalLength === undefined &&
    errors.maxFocalLength === undefined &&
    max < min
  ) {
    errors.maxFocalLength = 'The long end cannot be shorter than the wide end.'
  }

  return errors
}

export function addLens(kit: KitProfile, draft: LensDraft): KitProfile {
  const taken = kit.lenses.map((l) => l.id)
  const lens: Lens = {
    id: kitId('lens', draft.name, taken),
    name: trimmed(draft.name),
    minFocalLength: Math.round(Number(draft.minFocalLength)),
    maxFocalLength: Math.round(Number(draft.maxFocalLength)),
    maxAperture: null,
    forcesSensor: [],
    apscOnly: draft.apscOnly,
    notes: '',
  }
  return { ...kit, lenses: [...kit.lenses, lens] }
}

export interface BodyDraft {
  name: string
  sensor: SensorName
}

export function validateBody(draft: BodyDraft): FieldErrors {
  const errors: FieldErrors = {}
  if (trimmed(draft.name) === '') errors.name = 'Name it so you can pick it later.'
  if (draft.sensor !== 'fullFrame' && draft.sensor !== 'apsc') {
    errors.sensor = 'Pick full frame or APS-C.'
  }
  return errors
}

export function addBody(kit: KitProfile, draft: BodyDraft): KitProfile {
  const body: Body = {
    id: kitId('body', draft.name, kit.bodies.map((b) => b.id)),
    name: trimmed(draft.name),
    role: 'photo',
    sensor: draft.sensor,
    notes: '',
  }
  return { ...kit, bodies: [...kit.bodies, body] }
}

export interface DroneDraft {
  name: string
  weightGrams: string
  /** Comma separated 35mm equivalents. A drone camera has exactly one each. */
  focalLengths: string
}

/** The focal lengths in a drone draft, in order, ignoring empty entries. */
export function parseFocalList(raw: string): number[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(Number)
}

export function validateDrone(draft: DroneDraft): FieldErrors {
  const errors: FieldErrors = {}
  if (trimmed(draft.name) === '') errors.name = 'Name it so you can pick it later.'

  const weight = Number(draft.weightGrams)
  if (draft.weightGrams.trim() === '' || !Number.isFinite(weight)) {
    errors.weightGrams = 'Required. The FAA rules turn on it.'
  } else if (weight < WEIGHT_MIN_GRAMS || weight > WEIGHT_MAX_GRAMS) {
    errors.weightGrams = `Between ${WEIGHT_MIN_GRAMS} and ${WEIGHT_MAX_GRAMS}g.`
  }

  const focals = parseFocalList(draft.focalLengths)
  if (focals.length === 0) {
    errors.focalLengths = 'At least one, as a 35mm equivalent.'
  } else if (focals.length > MAX_DRONE_CAMERAS) {
    errors.focalLengths = `At most ${MAX_DRONE_CAMERAS}.`
  } else if (focals.some((f) => !Number.isFinite(f) || f < FOCAL_MIN || f > FOCAL_MAX)) {
    errors.focalLengths = `Numbers between ${FOCAL_MIN} and ${FOCAL_MAX}, separated by commas.`
  }

  return errors
}

/**
 * A drone's cameras are FIXED focal lengths, one each, never a range.
 *
 * The Air 3S was modelled as a zoom once and it let the model ask for focal
 * lengths the aircraft cannot produce. Anything added here is built the same
 * way: one camera per focal length, no span.
 */
export function addDrone(kit: KitProfile, draft: DroneDraft): KitProfile {
  const id = kitId('drone', draft.name, kit.drones.map((d) => d.id))
  const cameras: DroneCamera[] = parseFocalList(draft.focalLengths).map((equiv35, i) => ({
    id: `${id}-cam${i + 1}`,
    name: `${trimmed(draft.name)} ${Math.round(equiv35)}mm`,
    equiv35: Math.round(equiv35),
    maxAperture: 2.8,
    sensorNote: 'not stated',
    /*
     * Zero means "the manufacturer did not tell us". It is only ever used to
     * CHECK the computed field of view in kit.test.ts, never to compute one, so
     * an absent figure costs a check and nothing else.
     */
    publishedDiagonalFOV: 0,
  }))
  const drone: Drone = {
    id,
    name: trimmed(draft.name),
    weightGrams: Math.round(Number(draft.weightGrams)),
    cameras,
    notes: '',
    /*
     * NULL FOR AN AIRCRAFT SOMEBODY ADDED BY HAND, because this app has not
     * read its spec sheet. A wind limit invented for an aircraft is the worst
     * kind of confident wrong answer: somebody could fly on it. The panel
     * states the gust alone when there is no rating to state it against.
     */
    maxWindMps: null,
    maxWindSource: '',
  }
  return { ...kit, drones: [...kit.drones, drone] }
}

/**
 * Removing is unconditional.
 *
 * A position shot on a lens that is later removed keeps its own focal length
 * and still computes: plan.ts falls back to the first lens for the FOV lookup
 * and the number on the card is the number that was chosen. Blocking the
 * removal because an old plan references it would make the kit un-editable for
 * the exact reason someone edits it, which is that the gear changed.
 */
export function removeLens(kit: KitProfile, id: string): KitProfile {
  return { ...kit, lenses: kit.lenses.filter((l) => l.id !== id) }
}

export function removeBody(kit: KitProfile, id: string): KitProfile {
  return { ...kit, bodies: kit.bodies.filter((b) => b.id !== id) }
}

export function removeDrone(kit: KitProfile, id: string): KitProfile {
  return { ...kit, drones: kit.drones.filter((d) => d.id !== id) }
}

export const hasFieldErrors = (errors: FieldErrors): boolean =>
  Object.keys(errors).length > 0

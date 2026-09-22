/**
 * The event, read off an organizer's layout graphic and placed on real imagery.
 *
 * THE MAP SHOWS THE VENUE BUT NOT THE EVENT. A satellite photo of a marina says
 * nothing about where the course runs, where the crowd stands, or which pier is
 * closed. Organizers publish that, as a picture, and this is how it gets onto
 * the map.
 *
 * NO GEOREFERENCING OF THE ARTWORK, EVER. A course graphic is an illustration:
 * buildings in three-quarter view, roads schematised, the basin widened because
 * the course needed room. Fitting a homography to that is fitting a plane to
 * something that is not one, and it fails quietly, fifteen metres into the
 * water. So there is no layout-to-map transform anywhere in this codebase.
 *
 * Instead the placement question is asked AGAINST THE SATELLITE CAPTURE, which
 * is the one image the app can invert. Two calls:
 *
 *   1. READ the layout. What elements exist, what they are called, what shape
 *      the course is. Coordinates here are in the uploaded image's own space and
 *      are used for nothing but showing the reader what was found.
 *   2. PLACE them, given both images, as normalised coordinates ON THE CAPTURE.
 *      Those unproject through the recorded camera in src/components/MapView,
 *      exactly as camera positions already do.
 *
 * The model never returns a latitude and never asserts lighting. Neither has a
 * field in the shapes below, so either would be dropped on the floor.
 *
 * THE SPLIT IS LOAD BEARING. Placement is joined to extraction BY ID, so
 * re-placing after a pan or a zoom re-runs only step 2 and cannot quietly
 * return a different element list, which would throw away the shooter's
 * corrections.
 */

import { capWords, extractJsonObject } from './parsePlan.ts'

/**
 * The closed set. Anything else the model names is dropped rather than mapped
 * to the nearest, because a "hospitality marquee" filed as a crowd area is a
 * sightline blocker invented out of a guess.
 */
export const EVENT_TYPES = [
  'course',
  'start',
  'finish',
  'turn',
  'crowd',
  'vendors',
  'food',
  'stage',
  'restricted',
] as const

export type EventElementType = (typeof EVENT_TYPES)[number]

/** How an element is drawn, and therefore how many points it needs. */
export type EventShape = 'path' | 'area' | 'point'

/**
 * Fixed by type, NOT chosen by the model. Letting it pick the shape adds a
 * failure mode for no gain: a start line is a point and a crowd is an area
 * whatever the artwork looks like.
 */
export const SHAPE_OF: Record<EventElementType, EventShape> = {
  course: 'path',
  start: 'point',
  finish: 'point',
  turn: 'point',
  crowd: 'area',
  vendors: 'area',
  food: 'area',
  stage: 'area',
  restricted: 'area',
}

export interface UnitPoint {
  x: number
  y: number
}

export interface EventElement {
  id: string
  type: EventElementType
  shape: EventShape
  label: string
  /**
   * Where it sits on the UPLOADED artwork, normalised. Shown back to the reader
   * so they can see what was found; never used to compute a real coordinate.
   */
  layoutPoints: UnitPoint[]
}

export interface EventPlacement {
  /** Joined to an EventElement. An id that matches nothing is dropped. */
  id: string
  /** Where it sits on the SATELLITE CAPTURE, normalised. */
  points: UnitPoint[]
  /**
   * Vertices the model put outside the frame.
   *
   * DROPPED, NEVER CLAMPED. A course running off the edge of the capture cannot
   * be unprojected honestly past that edge, and clamping to the border would
   * draw a course that bends where the screen ends, which is a lie about the
   * geography. The count is reported so the shooter can widen the view and
   * place again.
   */
  droppedOffFrame: number
}

export type ExtractResult =
  | { ok: true; elements: EventElement[]; dropped: number }
  | { ok: false; reason: string; raw: string }

export type PlaceResult =
  | { ok: true; placements: EventPlacement[]; dropped: number; unplaced: string[] }
  | { ok: false; reason: string; raw: string }

/** A busy course graphic. Past this the reader is correcting a spreadsheet. */
export const MAX_ELEMENTS = 24
/**
 * Course vertices. Capped well below what a model will happily emit, because
 * every one of these becomes a draggable handle on a 390px screen and eighty
 * handles is not a correction UI.
 */
export const MAX_PATH_POINTS = 16
export const MAX_AREA_POINTS = 12
export const LABEL_WORD_CAP = 6

/** How many points each shape needs to be that shape at all. */
export const POINTS_FOR: Record<EventShape, { min: number; max: number }> = {
  path: { min: 2, max: MAX_PATH_POINTS },
  area: { min: 3, max: MAX_AREA_POINTS },
  point: { min: 1, max: 1 },
}

const isType = (value: unknown): value is EventElementType =>
  typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value)

const inFrame = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1

/**
 * Points that are usable as they stand.
 *
 * Anything outside the unit square is discarded rather than clamped, for the
 * reason on EventPlacement.droppedOffFrame. `kept` and `dropped` are returned
 * separately so the caller can tell "nothing was there" from "it ran off the
 * edge", which need different things said to the reader.
 */
function readPoints(value: unknown, max: number): { kept: UnitPoint[]; dropped: number } {
  if (!Array.isArray(value)) return { kept: [], dropped: 0 }
  const kept: UnitPoint[] = []
  let dropped = 0
  for (const entry of value.slice(0, max * 4)) {
    const item = entry as Record<string, unknown>
    if (typeof item?.x !== 'number' || typeof item?.y !== 'number') {
      dropped += 1
      continue
    }
    if (!inFrame(item.x) || !inFrame(item.y)) {
      dropped += 1
      continue
    }
    if (kept.length >= max) {
      dropped += 1
      continue
    }
    kept.push({ x: item.x, y: item.y })
  }
  return { kept, dropped }
}

/**
 * STEP 1: what is in the artwork.
 *
 * Ids are assigned HERE, by this code, not by the model. They are what step 2
 * joins against, and a model-supplied id is a model-supplied primary key.
 */
export function parseEventElements(raw: string): ExtractResult {
  const json = extractJsonObject(raw)
  if (json === null) {
    return {
      ok: false,
      reason: raw.includes('{')
        ? 'Response was cut off before the JSON finished.'
        : 'No JSON object found in the response.',
      raw,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'Response was not valid JSON, most likely cut off.', raw }
  }

  const list = (parsed as { elements?: unknown }).elements
  if (!Array.isArray(list)) {
    return { ok: false, reason: 'Response had no "elements" array.', raw }
  }

  const elements: EventElement[] = []
  let dropped = 0

  for (const entry of list.slice(0, MAX_ELEMENTS * 2)) {
    const item = entry as Record<string, unknown>
    if (!isType(item?.type)) {
      dropped += 1
      continue
    }
    if (elements.length >= MAX_ELEMENTS) {
      dropped += 1
      continue
    }

    const shape = SHAPE_OF[item.type]
    const bounds = POINTS_FOR[shape]
    const { kept } = readPoints(item.points, bounds.max)

    /*
     * A crowd area with two corners is not an area. Demoting it to a dot would
     * invent a shape the artwork does not have, and keeping it would feed a
     * degenerate ring to the siting check, so it goes.
     */
    if (kept.length < bounds.min) {
      dropped += 1
      continue
    }

    elements.push({
      id: `e${elements.length + 1}`,
      type: item.type,
      shape,
      label: capWords(typeof item.label === 'string' ? item.label : '', LABEL_WORD_CAP),
      layoutPoints: kept,
    })
  }

  if (elements.length === 0) {
    return { ok: false, reason: 'No usable event elements in the response.', raw }
  }

  return { ok: true, elements, dropped }
}

/**
 * STEP 2: where each of those sits on the satellite capture.
 *
 * Joined to `elements` by id. An id that matches nothing is dropped; an element
 * with no placement is returned in `unplaced` rather than being guessed at, so
 * the shooter places it by hand instead of being handed a confident wrong spot.
 */
export function parseEventPlacements(raw: string, elements: EventElement[]): PlaceResult {
  const json = extractJsonObject(raw)
  if (json === null) {
    return {
      ok: false,
      reason: raw.includes('{')
        ? 'Response was cut off before the JSON finished.'
        : 'No JSON object found in the response.',
      raw,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'Response was not valid JSON, most likely cut off.', raw }
  }

  const list = (parsed as { placements?: unknown }).placements
  if (!Array.isArray(list)) {
    return { ok: false, reason: 'Response had no "placements" array.', raw }
  }

  const byId = new Map(elements.map((element) => [element.id, element]))
  const placements: EventPlacement[] = []
  const seen = new Set<string>()
  let dropped = 0

  for (const entry of list.slice(0, MAX_ELEMENTS * 2)) {
    const item = entry as Record<string, unknown>
    const id = typeof item?.id === 'string' ? item.id : ''
    const element = byId.get(id)
    // An unknown id is the model inventing an element at placement time.
    if (element === undefined || seen.has(id)) {
      dropped += 1
      continue
    }

    const bounds = POINTS_FOR[element.shape]
    const { kept, dropped: offFrame } = readPoints(item.points, bounds.max)

    /*
     * Too little left INSIDE the frame to be the shape it is. Not an error and
     * not a guess: it goes back as unplaced, and the reader is told the view was
     * too tight.
     */
    if (kept.length < bounds.min) {
      dropped += 1
      continue
    }

    seen.add(id)
    placements.push({ id, points: kept, droppedOffFrame: offFrame })
  }

  const unplaced = elements.filter((element) => !seen.has(element.id)).map((e) => e.id)
  return { ok: true, placements, dropped, unplaced }
}

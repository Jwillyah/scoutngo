import type { LatLon } from './geo.ts'

/**
 * WHAT IS DANGEROUS AND WHAT IS IN THE WAY, CARRIED ON THE MAP LIKE A CHART
 * CARRIES OBSTRUCTIONS.
 *
 * WHY. "This site is full of power lines." A drone meeting an unmarked wire is
 * the worst failure this app can have.
 *
 * THE HARD RULE, AND IT IS STRUCTURAL RATHER THAN EDITORIAL:
 *
 *   THE APP NEVER SAYS AN AREA IS CLEAR OF HAZARDS. Not in any wording, from
 *   any source. It says what is MARKED.
 *
 * That is enforceable rather than remembered because of what this module does
 * not contain. There is no `isClear`, no `hazardFree`, no boolean that any
 * screen could render as reassurance, and no function that takes an area and
 * returns a verdict about it. The only thing anything can ask is how many
 * marks are in the list and what they are. An empty list is an empty list:
 * "nothing is marked here" is true, "this area is clear" is not, and the
 * second sentence has no value in this codebase to be built from.
 * tests/hazardNeverSaysClear.test.ts holds the line on the wording too.
 *
 * THREE SOURCES, AND THEY ARE NEVER MIXED.
 *
 *   'osm'     what OpenStreetMap has mapped. Transmission lines are mapped
 *             well; local distribution is patchy, and the layer says so.
 *   'manual'  what the shooter marked, standing there. The primary path, and
 *             the only one that is evidence of anything.
 *   'model'   the seam for a later pass. Nothing produces this yet. When
 *             something does, it arrives with confirmed: false, draws
 *             differently, and is accepted by a tap and never by itself.
 */

/** Something that could hurt an aircraft, a person, or a shot. */
export type HazardKind = 'power-line' | 'trees' | 'building' | 'structure'

/** Something worth knowing that is not a danger. Worth as much on a return visit. */
export type NoteKind = 'open-field' | 'launch' | 'parking'

export type MarkKind = HazardKind | NoteKind

export const HAZARD_KINDS: readonly HazardKind[] = [
  'power-line',
  'trees',
  'building',
  'structure',
] as const

export const NOTE_KINDS: readonly NoteKind[] = ['open-field', 'launch', 'parking'] as const

export const MARK_KINDS: readonly MarkKind[] = [...HAZARD_KINDS, ...NOTE_KINDS] as const

export const MARK_LABEL: Record<MarkKind, string> = {
  'power-line': 'Power line',
  trees: 'Trees',
  building: 'Building',
  structure: 'Structure',
  'open-field': 'Open field',
  launch: 'Launch spot',
  parking: 'Parking',
}

/**
 * THE PREDICATE. One place, so nothing decides for itself whether a parking
 * space is a danger.
 */
export function isHazard(kind: MarkKind): kind is HazardKind {
  return (HAZARD_KINDS as readonly MarkKind[]).includes(kind)
}

/**
 * Whether a thing loses its leaves.
 *
 * A building blocks in January. An oak does not. This is the only property
 * that depends on the date, and it is a coarse two-state answer on purpose:
 * see src/core/leaf.ts.
 */
export type Foliage = 'solid' | 'deciduous'

/** What a kind is unless the shooter says otherwise. Only trees can be bare. */
export const DEFAULT_FOLIAGE: Record<MarkKind, Foliage> = {
  'power-line': 'solid',
  trees: 'deciduous',
  building: 'solid',
  structure: 'solid',
  'open-field': 'solid',
  launch: 'solid',
  parking: 'solid',
}

/** Whether asking about leaves makes any sense for this kind. */
export function canBeDeciduous(kind: MarkKind): boolean {
  return kind === 'trees'
}

/**
 * A POINT OR A LINE, because a span of wire is a line and not a dot.
 *
 * The thing that made this necessary: a power line between two poles is 80 m
 * of hazard, and marking it as a point either misses most of it or exaggerates
 * where it is. A tree is a point. Both are needed.
 */
export type MarkShape =
  | { kind: 'point'; at: LatLon }
  | { kind: 'line'; path: LatLon[] }

export type MarkSource = 'osm' | 'manual' | 'model'

export interface SiteMark {
  id: string
  kind: MarkKind
  shape: MarkShape
  /**
   * Roughly how tall, in metres above ground, or NULL when nobody has said.
   *
   * Null is a real answer and travels as null: a mark with no height is still
   * worth drawing, it simply cannot take part in a sightline calculation. The
   * alternative, a default height, would put an invented number into geometry
   * that decides whether a position is usable.
   */
  heightMeters: number | null
  foliage: Foliage
  source: MarkSource
  /**
   * Whether a person has said this is real.
   *
   * True for anything the shooter marked and for anything OSM has mapped.
   * The seam for the model pass: a proposal arrives false, is drawn
   * differently, and only a tap makes it true. Nothing accepts itself.
   */
  confirmed: boolean
  note: string
}

/** Every point a mark occupies, whichever shape it is. */
export function markPoints(mark: SiteMark): LatLon[] {
  return mark.shape.kind === 'point' ? [mark.shape.at] : mark.shape.path
}

/**
 * HOW MANY OF EACH KIND ARE MARKED. Counts, and nothing else.
 *
 * Deliberately not a verdict and deliberately not capable of becoming one.
 * Whatever renders this can say "3 power lines marked"; there is nothing here
 * it could say "clear" from.
 */
export interface MarkTally {
  hazards: number
  notes: number
  /** How many hazards carry a height, so a sightline check can use them. */
  withHeight: number
  bySource: Record<MarkSource, number>
}

export function tallyMarks(marks: readonly SiteMark[]): MarkTally {
  const hazards = marks.filter((m) => isHazard(m.kind))
  return {
    hazards: hazards.length,
    notes: marks.length - hazards.length,
    withHeight: hazards.filter((m) => m.heightMeters !== null).length,
    bySource: {
      osm: marks.filter((m) => m.source === 'osm').length,
      manual: marks.filter((m) => m.source === 'manual').length,
      model: marks.filter((m) => m.source === 'model').length,
    },
  }
}

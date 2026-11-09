/*
 * THE WIND PAGE'S DIAL, AS GEOMETRY (Batch N, Section 3; board Detail2W).
 *
 * A compass in a DIAL_SIZE square: N, E, S and W just inside the ring, the
 * beach drawn through the middle at its real angle (square to the way the
 * beach faces, src/lib/coast.ts), the dial tinted by what a wind FROM each
 * bearing does to this beach, and an arrow where the wind goes.
 *
 * ONE SOURCE FOR ONSHORE AND OFFSHORE. The tint is windToBeach
 * (src/core/coastFacing.ts), asked for every degree as a FROM bearing: the
 * land side reads offshore (wind off the land), the sea side onshore, and the
 * two quarters along the beach cross-shore, exactly where the headline's tag
 * and the hours' colours put them. Nothing here has its own threshold. The
 * arrow starts on the rim the wind comes from, so its tail sits in the side
 * that names it, and its head shows where the air goes.
 *
 * LABELS. "offshore" and "onshore" sit inside the dial at the land and the
 * sea. When either would touch a letter's box, it is moved round, a degree
 * at a time, the shorter way, until it does not (placeDialLabels; the board
 * had "offshore" printed over the W). tests/windDial.test.ts holds every
 * facing to no overlap and to staying inside the drawing.
 */
import { windToBeach, type WindToBeach } from './coastFacing.ts'

export const DIAL_SIZE = 200
export const DIAL_C = DIAL_SIZE / 2
export const RING_R = 92
/** The letters' circle, just inside the ring. */
export const LETTER_R = 80
/** The labels' circle. */
export const LABEL_R = 52
/** A letter's box, px (12 px type). */
export const LETTER_BOX = { w: 12, h: 13 }
/** Width of one character of the 11 px label type, px; generous so a box never undersells the text. */
export const LABEL_CHAR_W = 6.5
export const LABEL_H = 13
/** No label moves further round than this; past it the label is dropped rather than drawn on a letter. */
export const LABEL_MAX_SHIFT_DEG = 60

const rad = (deg: number) => (deg * Math.PI) / 180
const norm = (d: number) => ((d % 360) + 360) % 360

/** A bearing (clockwise from north) and a radius to the drawing's x, y (y down). */
export function dialPoint(bearing: number, r: number): { x: number; y: number } {
  return { x: DIAL_C + r * Math.sin(rad(bearing)), y: DIAL_C - r * Math.cos(rad(bearing)) }
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Centre-anchored boxes overlap. */
export const boxesOverlap = (a: Box, b: Box): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h

export const CARDINALS: readonly { text: string; bearing: number }[] = [
  { text: 'N', bearing: 0 },
  { text: 'E', bearing: 90 },
  { text: 'S', bearing: 180 },
  { text: 'W', bearing: 270 },
]

export function cardinalBoxes(): (Box & { text: string })[] {
  return CARDINALS.map((c) => ({ text: c.text, ...dialPoint(c.bearing, LETTER_R), ...LETTER_BOX }))
}

export interface PlacedLabel extends Box {
  text: string
  /** Where it wanted to be, and where it went. */
  wanted: number
  bearing: number
}

export const labelWidth = (text: string): number => text.length * LABEL_CHAR_W + 4

/**
 * Each label on the labels' circle at its bearing, or the nearest bearing
 * (either way round) where its box touches no letter and no label placed
 * before it. Dropped when that is more than LABEL_MAX_SHIFT_DEG away.
 */
export function placeDialLabels(labels: readonly { text: string; bearing: number }[]): PlacedLabel[] {
  const taken: Box[] = cardinalBoxes()
  const out: PlacedLabel[] = []
  for (const l of labels) {
    const w = labelWidth(l.text)
    for (let shift = 0; shift <= LABEL_MAX_SHIFT_DEG; shift += 1) {
      const tries = shift === 0 ? [0] : [shift, -shift]
      const hit = tries
        .map((s) => {
          const bearing = norm(l.bearing + s)
          return { bearing, box: { ...dialPoint(bearing, LABEL_R), w, h: LABEL_H } }
        })
        .find((t) => !taken.some((b) => boxesOverlap(b, t.box)))
      if (hit !== undefined) {
        taken.push(hit.box)
        out.push({ text: l.text, wanted: norm(l.bearing), bearing: hit.bearing, ...hit.box })
        break
      }
    }
  }
  return out
}

/** The labels this dial carries: "offshore" at the land (the back of the facing), "onshore" at the sea. */
export const dialLabels = (facing: number): PlacedLabel[] =>
  placeDialLabels([
    { text: 'offshore', bearing: facing + 180 },
    { text: 'onshore', bearing: facing },
  ])

export interface DialSector {
  kind: WindToBeach
  /** Clockwise from start to end, degrees; end may pass 360. */
  start: number
  end: number
}

/** The tint as runs of one kind, one degree at a time (windToBeach of a wind FROM there), the run across north joined. */
export function dialSectors(facing: number): DialSector[] {
  const runs: DialSector[] = []
  for (let b = 0; b < 360; b += 1) {
    const kind = windToBeach(b + 0.5, facing)
    const last = runs[runs.length - 1]
    if (last !== undefined && last.kind === kind) last.end = b + 1
    else runs.push({ kind, start: b, end: b + 1 })
  }
  const first = runs[0]
  const last = runs[runs.length - 1]
  if (runs.length > 1 && first.kind === last.kind) {
    runs.shift()
    last.end = first.end + 360
  }
  return runs
}

/** A pie slice from the middle to the ring, as an SVG path. */
export function sectorPath(s: DialSector): string {
  const a = dialPoint(s.start, RING_R)
  const b = dialPoint(s.end, RING_R)
  const large = s.end - s.start > 180 ? 1 : 0
  const f = (n: number) => n.toFixed(2)
  return `M${DIAL_C},${DIAL_C} L${f(a.x)},${f(a.y)} A${RING_R},${RING_R} 0 ${large} 1 ${f(b.x)},${f(b.y)} Z`
}

/** The beach: a line through the middle, square to the facing, a little past the ring each way. */
export function beachLine(facing: number): { x1: number; y1: number; x2: number; y2: number } {
  const a = dialPoint(facing - 90, RING_R + 6)
  const b = dialPoint(facing + 90, RING_R + 6)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}

/**
 * THE FIRST CHANGE IN THE NEXT HOURS: the first hour whose kind differs from
 * the first hour that has one. Null when the hours hold one kind throughout,
 * or have none. Hours with no direction are skipped, never read as a change.
 */
export function windFlip(hours: readonly { at: Date; kind: WindToBeach | null }[]): { at: Date; to: WindToBeach } | null {
  const known = hours.filter((h): h is { at: Date; kind: WindToBeach } => h.kind !== null)
  const start = known[0]
  if (start === undefined) return null
  const change = known.find((h) => h.kind !== start.kind)
  return change === undefined ? null : { at: change.at, to: change.kind }
}

/** Models agree when their ground speed is within this of the models' median: 2.5 m/s, about 5 kt. */
export const AGREE_MPS = 2.5

/** How many models' speeds sit within AGREE_MPS of the median; null with no median or no model. */
export function modelsAgreeing(speeds: readonly (number | null)[], medianMps: number | null): { agree: number; of: number } | null {
  const said = speeds.filter((s): s is number => s !== null && Number.isFinite(s))
  if (medianMps === null || said.length === 0) return null
  return { agree: said.filter((s) => Math.abs(s - medianMps) <= AGREE_MPS).length, of: said.length }
}

/** The hour of an hourly series that holds `now`: the first that ends after it (an hour stands for the half hour either side). -1 when none does. */
export function hourIndexOf(hours: readonly Date[], now: Date): number {
  return hours.findIndex((h) => h.getTime() > now.getTime() - 1_800_000)
}

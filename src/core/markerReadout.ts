/*
 * THE MARKER'S READOUT, AS WORDS (Batch DRONE, Section 3; board
 * docs/mockups/Map_Timeline_Wind.png). One marker on the map, the spot's by
 * default, moved by holding anywhere; the card beside it reads the layer at
 * the marker for the hour under the thumb:
 *
 *   wind    "9 kt NNW · g13"
 *           "swell 0.7 ft 12 s ENE"           at sea only
 *           "KNTU 13 kt N · 1 h ago"          the nearest station, with its age
 *   tide    "2.4 ft · falling"
 *           "low 0.5 ft at 2:24 PM"
 *   clouds  "62% cloud"
 *
 * A value that is not known is a dash, never a zero (CLAUDE.md). The numbers
 * arrive already in the user's unit; times arrive already written by
 * src/core/timezone.ts. Nothing here says safe or clear.
 */
import { compassPoint } from './field.ts'

const round = (v: number) => String(Math.round(v))

/** "9 kt NNW · g13", or "— kt" when the forecast did not say. */
export function windLine(speed: number | null, fromDeg: number | null, gust: number | null, unit: string): string {
  if (speed === null || !Number.isFinite(speed)) return `— ${unit}`
  const dir = fromDeg === null ? '' : ` ${compassPoint(fromDeg)}`
  return `${round(speed)} ${unit}${dir}${gust === null || !Number.isFinite(gust) ? '' : ` · g${round(gust)}`}`
}

/** "swell 0.7 ft 12 s ENE" (the way it comes from); null on land, where the sea forecast says nothing. */
export function swellLine(feet: number | null, periodS: number | null, fromDeg: number | null): string | null {
  if (feet === null || !Number.isFinite(feet)) return null
  return `swell ${feet.toFixed(1)} ft${periodS === null ? '' : ` ${round(periodS)} s`}${fromDeg === null ? '' : ` ${compassPoint(fromDeg)}`}`
}

/** "KNTU 13 kt N · 1 h ago"; "KNTU calm" below a knot; "var" when it gave no direction. */
export function stationLine(id: string, speed: number | null, fromDeg: number | null, unit: string, age: string | null): string {
  const read = speed === null ? '—' : speed < 1 ? 'calm' : `${round(speed)} ${unit}${fromDeg === null ? ' var' : ` ${compassPoint(fromDeg)}`}`
  return `${id} ${read}${age === null ? '' : ` · ${age}`}`
}

/** "2.4 ft · falling" and "low 0.5 ft at 2:24 PM". `nextAt` is already a written clock. */
export function tideLines(feet: number | null, direction: 'rising' | 'falling' | 'slack' | null, next: { kind: 'high' | 'low'; feet: number; at: string } | null): string[] {
  const head = feet === null ? '— ft' : `${feet.toFixed(1)} ft${direction === null ? '' : ` · ${direction === 'slack' ? 'turning' : direction}`}`
  return next === null ? [head] : [head, `${next.kind} ${next.feet.toFixed(1)} ft at ${next.at}`]
}

/** "62% cloud" or "40% chance of rain"; a dash when not known. */
export function percentLine(pct: number | null, what: 'cloud' | 'rain'): string {
  const v = pct === null || !Number.isFinite(pct) ? '—' : `${round(Math.max(0, Math.min(100, pct)))}%`
  return what === 'cloud' ? `${v} cloud` : `${v} chance of rain`
}

/*
 * WHERE THE READOUT SITS (Batch FIX, Section 2.3). Beside the marker, never on
 * it: to the right when the card fits there, to the left when it fits there,
 * and otherwise on the side with more room, narrowed to that room (its lines
 * wrap at a space then, never mid-word, ux-rules 4). The old rule put the card
 * at the screen's left edge when it fitted on neither side, which on a 390 px
 * phone is the middle of the screen, where the spot's marker usually is: the
 * card covered it. Up and down it is held inside the map; beside the marker it
 * can be anywhere up and down without touching it.
 */
export interface ReadoutIn {
  /** The marker's centre in the map's box, px. */
  px: number
  py: number
  /** The card's own size with nothing narrowing it, px. */
  w: number
  h: number
  /** The map's box, px. */
  boxW: number
  boxH: number
  /** From the marker's centre to the card's near edge (past the ring), and the screen edge kept clear. */
  gap: number
  edge: number
}

export interface ReadoutAt {
  x: number
  y: number
  side: 'right' | 'left'
  /** The width the card is held to when it does not fit at its own; null when it does. */
  maxWidth: number | null
}

export function readoutBeside(r: ReadoutIn): ReadoutAt {
  const roomRight = r.boxW - r.edge - (r.px + r.gap)
  const roomLeft = r.px - r.gap - r.edge
  const fitsRight = r.w <= roomRight
  const side: 'right' | 'left' = fitsRight || (r.w > roomLeft && roomRight >= roomLeft) ? 'right' : 'left'
  const room = Math.max(0, side === 'right' ? roomRight : roomLeft)
  const width = Math.min(r.w, room)
  const x = side === 'right' ? r.px + r.gap : r.px - r.gap - width
  const y = Math.max(r.edge, Math.min(r.boxH - r.h - r.edge, r.py - r.h / 2))
  return { x, y, side, maxWidth: r.w <= room ? null : room }
}

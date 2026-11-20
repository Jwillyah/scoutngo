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

/*
 * AT THE SPOT, THE CALL (Batch FIX, Section 3.3; 17 Nov 7:05 AM the map
 * said "swell 1.0 ft 3 s NE" beside a Surf page reading 44099's own parts).
 * With the marker on the spot the readout says the surf call for the hour
 * under the thumb, the one the home, the Surf page and the week say
 * (src/lib/useSurfNow.ts surfHourOf): "surf 1–2 ft · Poor · choppy".
 */
export function surfCallLine(call: { words: string; size: string; quality: string | null }): string {
  return `surf ${call.words} · ${call.quality ?? call.size}`
}

/*
 * THE STATION LINE IN TWO PIECES (Batch 3D, Section 4.3; 17 Nov live, 390 px:
 * "14 / min ago"). The name is the part that may be cut ("Cape Henry"
 * becomes "Cape He…"); the reading and its age are not, a station's age is
 * what says whether to trust it (ux-rules 13). The card draws the name with
 * an ellipsis and the rest on one line that never breaks.
 */
export interface SplitLine {
  name: string
  rest: string
}

/** "KNTU" | "13 kt N · 1 h ago"; "calm" below a knot; "var" when it gave no direction. */
export function stationParts(id: string, speed: number | null, fromDeg: number | null, unit: string, age: string | null): SplitLine {
  const read = speed === null ? '—' : speed < 1 ? 'calm' : `${round(speed)} ${unit}${fromDeg === null ? ' var' : ` ${compassPoint(fromDeg)}`}`
  return { name: id, rest: `${read}${age === null ? '' : ` · ${age}`}` }
}

/** "KNTU 13 kt N · 1 h ago". */
export function stationLine(id: string, speed: number | null, fromDeg: number | null, unit: string, age: string | null): string {
  const p = stationParts(id, speed, fromDeg, unit, age)
  return `${p.name} ${p.rest}`
}

/** One line of the card: words, or a name that may be cut beside the reading that may not. */
export interface ToneLine {
  text: string
  /** The style the line wears, when its place in the card is not what decides it. */
  tone: 'value' | 'second' | 'third'
}
export type ReadoutLine = string | SplitLine | ToneLine

/**
 * The wind's lines: "5 kt NNE · g6" and, within 3 km of the spot where the
 * beach's facing is known, "cross-shore" on a line of its own, so neither
 * wraps mid-phrase ("cross-/shore here").
 */
export function windLines(speed: number | null, fromDeg: number | null, gust: number | null, unit: string, side: 'offshore' | 'onshore' | 'cross' | null): string[] {
  const head = windLine(speed, fromDeg, gust, unit)
  return side === null ? [head] : [head, side === 'cross' ? 'cross-shore' : side]
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
  /**
   * Batch 3D, Section 4.2: boxes in the map's box the card must keep off (the
   * layer chip, "Wind · Blend · surface", under the search): at 390 x 664
   * the card beside a marker near the top covered it.
   */
  avoid?: readonly Rect[]
  /**
   * Batch SIMPLE-2, Section 5.5: the bands at the top and the foot of the
   * map's box the card is held out of, px: the status bar's safe area and the
   * bar over the map at the top, the sheet with the timeline at the foot. The
   * card stays between them, beside the marker, whatever the marker's height
   * (0 when not given: the map's own edges).
   */
  top?: number
  bottom?: number
}

/** A box in the map's box, px. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Beside a box's edge, px: the card keeps this much clear of an obstacle. */
export const AVOID_PAD = 6

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
  const lo = (r.top ?? 0) + r.edge
  const hi = Math.max(lo, r.boxH - (r.bottom ?? 0) - r.h - r.edge)
  const y0 = Math.max(lo, Math.min(hi, r.py - r.h / 2))
  const y = clearOf(r.avoid ?? [], x, width, y0, r.h, lo, hi)
  return { x, y, side, maxWidth: r.w <= room ? null : room }
}

/*
 * The card's top edge kept off the obstacles it would overlap: the nearest
 * place to `y0`, above or below each one, that is still inside the map and
 * touches none of them. The card moves along its own side only, so it never
 * reaches the marker. Where nowhere is clear, it stays put.
 */
function clearOf(avoid: readonly Rect[], x: number, w: number, y0: number, h: number, lo: number, hi: number): number {
  const hits = (y: number) => avoid.some((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h + AVOID_PAD && y + h > o.y - AVOID_PAD)
  if (!hits(y0)) return y0
  const tries = avoid.flatMap((o) => [o.y + o.h + AVOID_PAD, o.y - AVOID_PAD - h]).filter((y) => y >= lo && y <= hi && !hits(y))
  if (tries.length === 0) return y0
  return tries.reduce((a, b) => (Math.abs(b - y0) < Math.abs(a - y0) ? b : a))
}

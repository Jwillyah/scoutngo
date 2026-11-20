/*
 * THE ONE TIDE CURVE'S GEOMETRY (Batch SIMPLE-2, Section 1). The Surf page's
 * thin strip, the Fish page's chart and the Tide page all draw this: the same
 * station samples over the same window give the same line, because the line
 * is worked out here once and the three screens only choose a size.
 *
 * Every number is arithmetic over NOAA's published samples (levelAt in
 * src/core/tide.ts). Past the end of the published curve the line stops; a
 * window the curve does not reach gives null, never a flat line.
 *
 *   y     the window's own lowest foot (floored) to its highest (ceiled), so
 *         two screens with the same window agree on the shape.
 *   ticks every 6th clock hour at the venue (0, 6, 12, 18), where it reads them.
 */
import { levelAt, type TideSample } from './tide.ts'
import { wallClock } from './timezone.ts'

/** One point of the line every this many minutes. */
export const TIDE_CURVE_STEP_MIN = 10
export const TIDE_TICK_EVERY_H = 6
const HOUR = 3_600_000

export interface TideCurveInput {
  curve: readonly TideSample[]
  from: Date
  to: Date
  /** Drawn as the now line / dot when inside the window and the curve reaches it. */
  now?: Date | null
  /** High and low waters to mark; the ones outside the window are left out. */
  marks?: readonly { at: Date; kind: 'high' | 'low' }[]
  /** A span to shade behind the line (the best window). */
  band?: { from: Date; to: Date } | null
  timeZone: string
  width: number
  height: number
  /** Room above and below the line, and under it for the time axis, px. */
  padTop: number
  padBottom: number
  axisRoom: number
}

export interface TideCurveMark {
  kind: 'high' | 'low'
  at: Date
  x: number
  y: number
  feet: number
}

export interface TideCurveModel {
  from: number
  to: number
  path: string
  area: string
  now: { x: number; y: number; feet: number } | null
  marks: TideCurveMark[]
  band: { x0: number; x1: number } | null
  ticks: { x: number; at: Date }[]
  lowFeet: number
  highFeet: number
  /** The plot's bottom edge, px: where the area closes and the axis starts. */
  plotBottom: number
}

export function tideCurveModel(i: TideCurveInput): TideCurveModel | null {
  const from = i.from.getTime()
  const to = i.to.getTime()
  if (!(to > from)) return null
  const step = TIDE_CURVE_STEP_MIN * 60_000
  const xOf = (t: number) => ((t - from) / (to - from)) * i.width
  const samples: { t: number; feet: number }[] = []
  for (let t = from; t <= to; t += step) {
    const f = levelAt(i.curve as TideSample[], new Date(t))
    if (f !== null) samples.push({ t, feet: f })
  }
  if (samples.length < 2) return null
  const feet = samples.map((s) => s.feet)
  const lowFeet = Math.floor(Math.min(...feet))
  const highFeet = Math.ceil(Math.max(...feet))
  const plotBottom = i.height - i.axisRoom
  const top = i.padTop
  const bottom = plotBottom - i.padBottom
  const yOf = (f: number) => top + (1 - (f - lowFeet) / Math.max(1, highFeet - lowFeet)) * (bottom - top)
  const pts = samples.map((s) => `${xOf(s.t).toFixed(1)},${yOf(s.feet).toFixed(1)}`)
  const path = `M${pts.join(' L')}`
  const first = xOf(samples[0].t).toFixed(1)
  const last = xOf(samples[samples.length - 1].t).toFixed(1)
  const area = `${path} L${last},${plotBottom} L${first},${plotBottom} Z`
  const marks: TideCurveMark[] = (i.marks ?? [])
    .filter((m) => m.at.getTime() >= from && m.at.getTime() <= to)
    .flatMap((m) => {
      const f = levelAt(i.curve as TideSample[], m.at)
      return f === null ? [] : [{ kind: m.kind, at: m.at, x: xOf(m.at.getTime()), y: yOf(f), feet: f }]
    })
  let now: TideCurveModel['now'] = null
  if (i.now != null && i.now.getTime() >= from && i.now.getTime() <= to) {
    const f = levelAt(i.curve as TideSample[], i.now)
    if (f !== null) now = { x: xOf(i.now.getTime()), y: yOf(f), feet: f }
  }
  const band = i.band == null ? null : { x0: Math.max(0, xOf(i.band.from.getTime())), x1: Math.min(i.width, xOf(i.band.to.getTime())) }
  const ticks = hourTicks(i.from, i.to, i.timeZone).map((at) => ({ x: xOf(at.getTime()), at }))
  return { from, to, path, area, now, marks, band: band !== null && band.x1 > band.x0 ? band : null, ticks, lowFeet, highFeet, plotBottom }
}

/** Every 6th clock hour at the venue inside a window: the time axis of the curve and of the wind bar. */
export function hourTicks(from: Date, to: Date, timeZone: string, everyH: number = TIDE_TICK_EVERY_H): Date[] {
  const out: Date[] = []
  for (let t = Math.ceil(from.getTime() / HOUR) * HOUR; t <= to.getTime(); t += HOUR) {
    const w = wallClock(new Date(t), timeZone)
    if (w !== null && w.minute === 0 && w.hour % everyH === 0) out.push(new Date(t))
  }
  return out
}

/** The time at a share (0 to 1) of the way across a window: what a finger on the curve is pointing at. */
export function timeAtFraction(from: Date, to: Date, share: number): Date {
  const s = Math.max(0, Math.min(1, share))
  return new Date(from.getTime() + s * (to.getTime() - from.getTime()))
}

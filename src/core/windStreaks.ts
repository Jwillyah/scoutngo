/*
 * THE WIND MAP OVERLAY'S ARITHMETIC (Batch F, Section 3; board "WIND · map
 * overlay"): particle streaks drawn over the visible map from the same coarse
 * forecast grid the wind layer already shades (src/core/cloudGrid.ts, from
 * the shared weather store), at the hour on the time bar.
 *
 * FROM AND TO. A forecast gives the direction the wind blows FROM; a streak
 * moves the way the air goes, TO. Getting that backwards draws the wind
 * coming the wrong way, so it is one function, toVector, and a test.
 *
 * NOTHING INVENTED BETWEEN CELLS beyond a straight blend of the four around
 * a point, and nothing outside the grid: a streak that leaves it is dropped.
 */
import type { ForecastCell } from './cloudGrid.ts'
import { windAtHeight } from './windProfile.ts'

/** East and north components, metres a second, of the way the air moves. */
export interface Flow {
  u: number
  v: number
  speed: number
}

/** A wind blowing FROM `fromDeg` at `speedMps`, as the way the air goes. */
export function toVector(fromDeg: number, speedMps: number): Flow {
  const to = ((fromDeg + 180) * Math.PI) / 180
  return { u: speedMps * Math.sin(to), v: speedMps * Math.cos(to), speed: speedMps }
}

export interface WindField {
  /** Cell centres, row by row, west to east and south to north. */
  lats: number[]
  lons: number[]
  /** flows[iy][ix], or null where the model did not answer. */
  flows: (Flow | null)[][]
}

/* The grid is walked in metres, so a row's latitudes differ in the fifth decimal: rows and columns are grouped within this. */
const SAME_DEG = 0.03
function axis(values: number[]): number[] {
  const out: number[][] = []
  for (const v of [...values].sort((a, b) => a - b)) {
    const last = out[out.length - 1]
    if (last !== undefined && v - last[0] < SAME_DEG) last.push(v)
    else out.push([v])
  }
  return out.map((g) => g.reduce((s, x) => s + x, 0) / g.length)
}
const indexOn = (xs: number[], v: number) => xs.findIndex((x) => Math.abs(x - v) < SAME_DEG)

/** The grid's cells at one height as a field; null when there is nothing to draw. */
export function windField(cells: readonly ForecastCell[], heightM: number): WindField | null {
  if (cells.length === 0) return null
  const lats = axis(cells.map((c) => c.at.lat))
  const lons = axis(cells.map((c) => c.at.lon))
  if (lats.length < 2 || lons.length < 2) return null
  const flows: (Flow | null)[][] = lats.map(() => lons.map(() => null))
  let any = false
  for (const c of cells) {
    const iy = indexOn(lats, c.at.lat)
    const ix = indexOn(lons, c.at.lon)
    const w = windAtHeight(c.wind ?? [], heightM)
    if (iy < 0 || ix < 0 || w.speedMps === null || w.fromDegrees === null) continue
    flows[iy][ix] = toVector(w.fromDegrees, w.speedMps)
    any = true
  }
  return any ? { lats, lons, flows } : null
}

const findSpan = (xs: number[], x: number): [number, number] | null => {
  if (x < xs[0] || x > xs[xs.length - 1]) return null
  for (let i = 0; i < xs.length - 1; i += 1) if (x <= xs[i + 1]) return [i, (x - xs[i]) / (xs[i + 1] - xs[i])]
  return null
}

/** The flow at a point inside the grid, blended from the four cells round it; null outside or where one is missing. */
export function flowAt(f: WindField, lat: number, lon: number): Flow | null {
  const sy = findSpan(f.lats, lat)
  const sx = findSpan(f.lons, lon)
  if (sy === null || sx === null) return null
  const [iy, ty] = sy
  const [ix, tx] = sx
  const a = f.flows[iy][ix]
  const b = f.flows[iy][ix + 1]
  const c = f.flows[iy + 1][ix]
  const d = f.flows[iy + 1][ix + 1]
  if (a === null || b === null || c === null || d === null) return null
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t
  const u = lerp(lerp(a.u, b.u, tx), lerp(c.u, d.u, tx), ty)
  const v = lerp(lerp(a.v, b.v, tx), lerp(c.v, d.v, tx), ty)
  return { u, v, speed: Math.hypot(u, v) }
}

/** One step of a streak's head: metres east and north the air carries it in `seconds`. */
export function step(flow: Flow, seconds: number): { east: number; north: number } {
  return { east: flow.u * seconds, north: flow.v * seconds }
}

/*
 * THE COLOURS. Teal (the water's chrome, calm air) to gold as the wind
 * nears the aircraft's rating; amber ONLY above the rating. With no rating
 * there is nothing to be over, so never amber: the scale runs to 15 m/s
 * (about 30 kt) and stops at gold.
 */
export const STREAK_TEAL: readonly [number, number, number] = [45, 212, 191]
export const STREAK_GOLD: readonly [number, number, number] = [245, 176, 33]
export const STREAK_AMBER: readonly [number, number, number] = [255, 160, 74]
export const UNRATED_TOP_MPS = 15

export function streakColour(speedMps: number, ratedMps: number | null): string {
  if (ratedMps !== null && ratedMps > 0 && speedMps > ratedMps) return `rgb(${STREAK_AMBER.join(',')})`
  const top = ratedMps !== null && ratedMps > 0 ? ratedMps : UNRATED_TOP_MPS
  const t = Math.max(0, Math.min(1, speedMps / top))
  const c = STREAK_TEAL.map((v, i) => Math.round(v + (STREAK_GOLD[i] - v) * t))
  return `rgb(${c.join(',')})`
}

/** Streaks or arrows: arrows draw once and do not animate, for slow phones and reduced motion. */
export type WindDraw = 'streaks' | 'arrows'

/*
 * STORMS IN THE NEXT 0-3 HOURS (Batch K, Section 2): cells on radar,
 * tracked scan to scan, carried forward. All arithmetic; nothing here
 * fetches.
 *
 * CELLS. On a grid of reflectivity (Iowa State's national composite, about
 * 1 km a pixel at zoom 7), a cell is a patch of CELL_DBZ or more, touching
 * pixels joined (8 ways), at least MIN_CELL_PX of them. Its place is the
 * centroid of its pixels weighted by how far over CELL_DBZ each is.
 *
 * TRACKING. Each cell in the newest scan is matched to the cell in the scan
 * before whose centroid is nearest where it would have been, within what
 * MAX_SPEED_KMH could cover; then that one to the scan before it. Its
 * motion is the whole chain's displacement over its time. A cell with no
 * match moves with the median of the matched ones (the steering flow) and
 * is a step less sure.
 *
 * ARRIVAL. Every pixel of the cell is carried along its motion: the pixels
 * whose path passes within HIT_KM of the venue give the arrival (the first)
 * and the end (the last, plus a pixel's width). A path that misses is said
 * as how far it passes and on which side. Nothing past MAX_LEAD_MIN from
 * extrapolation alone: cells grow and die, and an hour and a half is about
 * as far as a straight line holds. Sure-ness falls with lead time:
 * up to 30 min "likely", to 60 "about", beyond "rough".
 */
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { compassPoint } from './field.ts'

export const CELL_DBZ = 40
export const MIN_CELL_PX = 3
export const MAX_SPEED_KMH = 130
export const HIT_KM = 3
export const MAX_LEAD_MIN = 90
/** Cells farther than this are not said. */
export const CELL_REACH_KM = 160.9 /* 100 mi */
export const STILL_KMH = 5
/** A pass is said only this near: farther, it is not coming by. */
export const PASS_SAY_KM = 30

/** A reflectivity grid in web-mercator pixels: dbz[y * w + x], NaN where there is no echo. */
export interface Grid {
  w: number
  h: number
  dbz: Float32Array
  /** The global pixel of [0, 0] at this zoom (tile x * 256, tile y * 256). */
  px0: number
  py0: number
  zoom: number
}

export function pixelLatLon(zoom: number, gx: number, gy: number): LatLon {
  const n = 256 * 2 ** zoom
  const lon = (gx / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / n))) * 180) / Math.PI
  return { lat, lon }
}

export function latLonPixel(zoom: number, at: LatLon): { gx: number; gy: number } {
  const n = 256 * 2 ** zoom
  const r = (at.lat * Math.PI) / 180
  return { gx: ((at.lon + 180) / 360) * n, gy: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }
}

export interface Cell {
  at: LatLon
  maxDbz: number
  px: number
  /** Every pixel's centre. */
  points: LatLon[]
}

export function findCells(g: Grid, threshold = CELL_DBZ): Cell[] {
  const seen = new Uint8Array(g.w * g.h)
  const cells: Cell[] = []
  for (let i = 0; i < g.w * g.h; i += 1) {
    if (seen[i] === 1 || !(g.dbz[i] >= threshold)) continue
    const stack = [i]
    seen[i] = 1
    const idx: number[] = []
    while (stack.length > 0) {
      const k = stack.pop() as number
      idx.push(k)
      const x = k % g.w
      const y = (k - x) / g.w
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue
          const j = ny * g.w + nx
          if (seen[j] === 0 && g.dbz[j] >= threshold) {
            seen[j] = 1
            stack.push(j)
          }
        }
      }
    }
    if (idx.length < MIN_CELL_PX) continue
    let sx = 0
    let sy = 0
    let sw = 0
    let max = -Infinity
    const points: LatLon[] = []
    for (const k of idx) {
      const x = k % g.w
      const y = (k - x) / g.w
      const w = g.dbz[k] - threshold + 1
      sx += (x + 0.5) * w
      sy += (y + 0.5) * w
      sw += w
      max = Math.max(max, g.dbz[k])
      points.push(pixelLatLon(g.zoom, g.px0 + x + 0.5, g.py0 + y + 0.5))
    }
    cells.push({ at: pixelLatLon(g.zoom, g.px0 + sx / sw, g.py0 + sy / sw), maxDbz: max, px: idx.length, points })
  }
  return cells
}

/** East and north of an origin, km (flat: fine over 200 km). */
export function enKm(origin: LatLon, p: LatLon): { e: number; n: number } {
  return { e: (p.lon - origin.lon) * 111.32 * Math.cos((origin.lat * Math.PI) / 180), n: (p.lat - origin.lat) * 110.57 }
}

export interface Scan {
  at: Date
  cells: Cell[]
}

export interface Track {
  cell: Cell
  /** km/h east and north; null when nothing could be matched anywhere. */
  v: { e: number; n: number } | null
  /** Scans the cell was followed through (1 = only the newest). */
  scans: number
  /** Moving with the others, not its own match. */
  borrowed: boolean
}

function match(prev: readonly Cell[], cur: Cell, hours: number, guess: { e: number; n: number } | null): Cell | null {
  const reach = MAX_SPEED_KMH * hours
  let best: Cell | null = null
  let bestD = Infinity
  for (const p of prev) {
    const d = enKm(p.at, cur.at)
    const ex = guess === null ? d : { e: d.e - guess.e * hours, n: d.n - guess.n * hours }
    const miss = Math.hypot(ex.e, ex.n)
    if (Math.hypot(d.e, d.n) <= reach && miss < bestD) {
      best = p
      bestD = miss
    }
  }
  return best
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** How far a cell's own motion may differ from the flow before it is put down to a bad match, km/h. */
export const OFF_FLOW_KMH = 45

function follow(scans: readonly Scan[], cell: Cell, seed: { e: number; n: number } | null): Track {
  const newest = scans[scans.length - 1]
  let cur = cell
  let back = 0
  let v: { e: number; n: number } | null = null
  for (let s = scans.length - 2; s >= 0; s -= 1) {
    const hours = (scans[s + 1].at.getTime() - scans[s].at.getTime()) / 3_600_000
    if (hours <= 0) break
    const prev = match(scans[s].cells, cur, hours, v ?? seed)
    if (prev === null) break
    cur = prev
    back += 1
    const total = (newest.at.getTime() - scans[s].at.getTime()) / 3_600_000
    const d = enKm(cur.at, cell.at)
    v = { e: d.e / total, n: d.n / total }
  }
  return { cell, v, scans: back + 1, borrowed: false }
}

/**
 * Scans oldest first. Two passes: each cell followed on its own; then the
 * median of those motions (the steering flow) seeds a second match, and a
 * motion more than OFF_FLOW_KMH off it, or none, takes the flow instead.
 */
export function trackCells(scans: readonly Scan[]): Track[] {
  if (scans.length === 0) return []
  const newest = scans[scans.length - 1]
  const flowOf = (ts: Track[]) => {
    const moving = ts.filter((t) => t.v !== null)
    return moving.length === 0 ? null : { e: median(moving.map((t) => (t.v as { e: number }).e)), n: median(moving.map((t) => (t.v as { n: number }).n)) }
  }
  const flow = flowOf(newest.cells.map((c) => follow(scans, c, null)))
  return newest.cells.map((c) => {
    const t = follow(scans, c, flow)
    if (flow === null) return t
    const off = t.v === null ? Infinity : Math.hypot(t.v.e - flow.e, t.v.n - flow.n)
    return off <= OFF_FLOW_KMH ? t : { ...t, v: flow, borrowed: true }
  })
}

export type Sure = 'likely' | 'about' | 'rough'

export interface CellCall {
  /** The cell's centre now. */
  at: LatLon
  km: number
  bearingDeg: number
  /** Where it is heading, degrees; null when still. */
  towardDeg: number | null
  kmh: number
  /** Over the venue now. */
  over: boolean
  arrives: Date | null
  ends: Date | null
  /** It passes by: the nearest it comes, km, and which side of you. */
  passKm: number | null
  passSide: string | null
  passAt: Date | null
  /** Its path reaches you, but later than MAX_LEAD_MIN. */
  beyond: boolean
  sure: Sure
  maxDbz: number
  borrowed: boolean
}

const sureFor = (leadMin: number, borrowed: boolean): Sure => {
  const order: Sure[] = ['likely', 'about', 'rough']
  const i = leadMin <= 30 ? 0 : leadMin <= 60 ? 1 : 2
  return order[Math.min(2, i + (borrowed ? 1 : 0))]
}

export function cellCall(venue: LatLon, t: Track, scanAt: Date, pixelKm = 1.2): CellCall {
  const km = distanceMeters(venue, t.cell.at) / 1000
  const bearingDeg = bearingBetween(venue, t.cell.at)
  const base = { at: t.cell.at, km, bearingDeg, maxDbz: t.cell.maxDbz, borrowed: t.borrowed, arrives: null, ends: null, passKm: null, passSide: null, passAt: null, beyond: false }
  const pts = t.cell.points.map((p) => enKm(venue, p))
  const hitNow = pts.some((p) => Math.hypot(p.e, p.n) <= HIT_KM)
  const v = t.v
  const kmh = v === null ? 0 : Math.hypot(v.e, v.n)
  if (v === null || kmh < STILL_KMH) {
    return { ...base, towardDeg: null, kmh, over: hitNow, sure: sureFor(0, t.borrowed) }
  }
  const towardDeg = ((Math.atan2(v.e, v.n) * 180) / Math.PI + 360) % 360
  const at = (h: number) => new Date(scanAt.getTime() + h * 3_600_000)
  let first = Infinity
  let last = -Infinity
  let pass = Infinity
  let passH = 0
  let passCross = 0
  for (const p of pts) {
    /* The pixel at time h is p + v h; the venue is at 0. */
    const h = -(p.e * v.e + p.n * v.n) / (kmh * kmh)
    const cross = (p.e * v.n - p.n * v.e) / kmh
    if (Math.abs(cross) <= HIT_KM) {
      first = Math.min(first, h)
      last = Math.max(last, h)
    } else if (h > 0 && Math.abs(cross) < pass) {
      pass = Math.abs(cross)
      passH = h
      passCross = cross
    }
  }
  const tail = pixelKm / kmh
  if (first <= 0 && last >= 0) {
    const lead = last * 60
    return { ...base, towardDeg, kmh, over: true, ends: lead <= MAX_LEAD_MIN ? at(last + tail) : null, sure: sureFor(lead, t.borrowed) }
  }
  if (Number.isFinite(first) && first > 0) {
    const lead = first * 60
    if (lead > MAX_LEAD_MIN) return { ...base, towardDeg, kmh, over: false, beyond: true, sure: 'rough' }
    return { ...base, towardDeg, kmh, over: false, arrives: at(first), ends: last * 60 <= MAX_LEAD_MIN ? at(last + tail) : null, sure: sureFor(lead, t.borrowed) }
  }
  if (Number.isFinite(pass) && pass <= PASS_SAY_KM && passH * 60 <= MAX_LEAD_MIN) {
    /* The side of you the cell passes on: left of its heading when cross < 0. */
    const sideDeg = (towardDeg + (passCross > 0 ? -90 : 90) + 360) % 360
    return { ...base, towardDeg, kmh, over: false, passKm: pass, passSide: compassPoint((sideDeg + 180) % 360), passAt: at(passH), sure: sureFor(passH * 60, t.borrowed) }
  }
  return { ...base, towardDeg, kmh, over: false, sure: 'rough' }
}

/** The cells worth saying: over you, arriving, passing, then the nearest; within CELL_REACH_KM. */
export function cellCalls(venue: LatLon, tracks: readonly Track[], scanAt: Date): CellCall[] {
  const calls = tracks.map((t) => cellCall(venue, t, scanAt)).filter((c) => c.km <= CELL_REACH_KM)
  const rank = (c: CellCall) => (c.over ? 0 : c.arrives !== null ? 1 : c.passKm !== null ? 2 : 3)
  return calls.sort((a, b) => rank(a) - rank(b) || (a.arrives?.getTime() ?? 0) - (b.arrives?.getTime() ?? 0) || a.km - b.km)
}

export interface Words {
  /** 'mi' or 'km'. */
  dist: 'mi' | 'km'
  clock: (d: Date) => string
}

const MI = 1.609344

/** "Cell 18 mi WSW · moving ENE 25 mph · arrives ~7:40 · ends ~8:10". */
export function cellLine(c: CellCall, w: Words): string {
  const d = (km: number) => `${Math.max(1, Math.round(w.dist === 'mi' ? km / MI : km))} ${w.dist}`
  const s = (kmh: number) => `${Math.round(w.dist === 'mi' ? kmh / MI : kmh)} ${w.dist === 'mi' ? 'mph' : 'km/h'}`
  const where = c.over ? 'Cell over you' : `Cell ${d(c.km)} ${compassPoint(c.bearingDeg)}`
  const move = c.towardDeg === null ? 'not moving' : `moving ${compassPoint(c.towardDeg)} ${s(c.kmh)}`
  const tilde = c.sure === 'likely' ? '~' : c.sure === 'about' ? 'about ' : 'roughly '
  const parts = [where, move]
  if (c.arrives !== null) parts.push(`arrives ${tilde}${w.clock(c.arrives)}`)
  if (c.ends !== null) parts.push(`ends ${tilde}${w.clock(c.ends)}`)
  if (c.passKm !== null && c.passSide !== null && c.passAt !== null) parts.push(`passes ${d(c.passKm)} ${c.passSide} of you ${tilde}${w.clock(c.passAt)}`)
  if (c.beyond) parts.push('reaches you later than 90 min: not said')
  return parts.join(' · ')
}

/** Rain on radar: RAIN_DBZ or more. */
export const RAIN_DBZ = 20

/** The nearest echo of minDbz or more to the venue on a grid, km and bearing; null when none. */
export function nearestEcho(g: Grid, venue: LatLon, minDbz = RAIN_DBZ): { km: number; bearingDeg: number } | null {
  const v = latLonPixel(g.zoom, venue)
  const vx = v.gx - g.px0
  const vy = v.gy - g.py0
  let best = Infinity
  let bx = -1
  let by = -1
  for (let y = 0; y < g.h; y += 1) {
    for (let x = 0; x < g.w; x += 1) {
      if (!(g.dbz[y * g.w + x] >= minDbz)) continue
      const d = (x + 0.5 - vx) ** 2 + (y + 0.5 - vy) ** 2
      if (d < best) {
        best = d
        bx = x
        by = y
      }
    }
  }
  if (bx < 0) return null
  const p = pixelLatLon(g.zoom, g.px0 + bx + 0.5, g.py0 + by + 0.5)
  return { km: distanceMeters(venue, p) / 1000, bearingDeg: bearingBetween(venue, p) }
}

/** Where the cells as a whole are heading, degrees, from the tracks' median motion; null when still or unknown. */
export function flowToward(tracks: readonly Track[]): number | null {
  const v = tracks.filter((t) => t.v !== null && !t.borrowed).map((t) => t.v as { e: number; n: number })
  if (v.length === 0) return null
  const e = median(v.map((x) => x.e))
  const n = median(v.map((x) => x.n))
  return Math.hypot(e, n) < STILL_KMH ? null : ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360
}

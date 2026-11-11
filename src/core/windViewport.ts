/*
 * THE WIND LAYER v3's ARITHMETIC (Batch Map, Section 1; board docs/mockups/
 * WindV3.png). The map asks for wind over what is ON SCREEN, never around
 * the user: the viewport's bounds are covered by fixed blocks of grid
 * points, and every point sits on a fixed grid, so two phones looking at the
 * same coast ask the same URLs and the forecast cache (api/forecast.ts)
 * answers both from one copy. The phone's position is never in a request.
 *
 *   step       the grid's spacing for the zoom: 0.25° (the global models'
 *              own grid) from zoom 6 to 9, 0.05° (the cache's own grid,
 *              about HRRR's 3 km) from zoom 9, wider when zoomed far out so
 *              a viewport stays a handful of requests
 *   blocks     BLOCK x BLOCK points a request (25: api/forecast.ts takes up
 *              to 25), aligned to multiples of BLOCK x step, so a block's
 *              URL depends only on where it is, not on where the screen is
 *   field      u and v (m/s, the way the air moves) per point, read between
 *              points by bilinear interpolation: smooth, no squares
 *   colour     knots on the board's scale: 0 5 10 15 20 25 30+
 */

export const BLOCK = 5
/** At most this many requests for one viewport; a wider view takes a wider step. */
export const MAX_BLOCKS = 9

export interface Bounds {
  south: number
  west: number
  north: number
  east: number
}

const STEPS = [0.05, 0.25, 0.5, 1, 2, 4] as const

/** The grid's spacing, degrees: the finest of STEPS at this zoom whose blocks cover the bounds in MAX_BLOCKS. */
export function gridStep(bounds: Bounds, zoom: number): number {
  const first = zoom >= 9 ? 0 : 1
  for (let i = first; i < STEPS.length; i += 1) if (blocksFor(bounds, STEPS[i]).length <= MAX_BLOCKS) return STEPS[i]
  return STEPS[STEPS.length - 1]
}

const snapDown = (v: number, size: number) => Math.floor(v / size + 1e-9) * size
const fix = (v: number) => Number(v.toFixed(2))

export interface Block {
  /** The south-west point, on the step's grid. */
  south: number
  west: number
  step: number
  /** BLOCK x BLOCK points, row by row from the south-west. */
  points: { lat: number; lon: number }[]
}

/** The fixed blocks that cover the bounds (with one point of margin), at `step`. */
export function blocksFor(b: Bounds, step: number): Block[] {
  const size = BLOCK * step
  const out: Block[] = []
  const s0 = snapDown(Math.max(-85, b.south - step), size)
  const w0 = snapDown(b.west - step, size)
  for (let s = s0; s < Math.min(85, b.north + step); s += size) {
    for (let w = w0; w < b.east + step; w += size) {
      const points: { lat: number; lon: number }[] = []
      for (let i = 0; i < BLOCK; i += 1) for (let j = 0; j < BLOCK; j += 1) points.push({ lat: fix(s + i * step), lon: fix(((w + j * step + 540) % 360) - 180) })
      out.push({ south: fix(s), west: fix(w), step, points })
      if (out.length > 64) return out
    }
  }
  return out
}

/** The way the air moves, m/s east and north, from a speed and the direction it comes FROM. */
export function toUV(speedMps: number, fromDeg: number): { u: number; v: number } {
  const to = ((fromDeg + 180) * Math.PI) / 180
  return { u: speedMps * Math.sin(to), v: speedMps * Math.cos(to) }
}

/** Speed and FROM direction back from u and v. */
export function fromUV(u: number, v: number): { speedMps: number; fromDeg: number } {
  const to = (Math.atan2(u, v) * 180) / Math.PI
  return { speedMps: Math.hypot(u, v), fromDeg: (to + 180 + 360) % 360 }
}

export interface WindSample {
  lat: number
  lon: number
  u: number
  v: number
  gust: number | null
}

/** A regular field over the blocks' points: a lookup by grid index, the step and the origin. */
export interface Field {
  step: number
  south: number
  west: number
  rows: number
  cols: number
  /** rows x cols, null where no point answered. */
  cells: (WindSample | null)[]
}

export function buildField(samples: readonly WindSample[], step: number): Field | null {
  if (samples.length === 0) return null
  const south = Math.min(...samples.map((s) => s.lat))
  const west = Math.min(...samples.map((s) => s.lon))
  const rows = Math.round((Math.max(...samples.map((s) => s.lat)) - south) / step) + 1
  const cols = Math.round((Math.max(...samples.map((s) => s.lon)) - west) / step) + 1
  const cells: (WindSample | null)[] = new Array(rows * cols).fill(null)
  for (const s of samples) {
    const r = Math.round((s.lat - south) / step)
    const c = Math.round((s.lon - west) / step)
    if (r >= 0 && r < rows && c >= 0 && c < cols) cells[r * cols + c] = s
  }
  return { step, south, west, rows, cols, cells }
}

/** u, v and gust at a point, bilinear between the four grid points around it; null outside the field or where a corner is missing. */
export function sampleField(f: Field, lat: number, lon: number): { u: number; v: number; gust: number | null } | null {
  const y = (lat - f.south) / f.step
  const x = (lon - f.west) / f.step
  if (y < 0 || x < 0 || y > f.rows - 1 || x > f.cols - 1) return null
  const r0 = Math.min(f.rows - 2, Math.floor(y))
  const c0 = Math.min(f.cols - 2, Math.floor(x))
  if (r0 < 0 || c0 < 0) {
    const only = f.cells[0]
    return only === null ? null : { u: only.u, v: only.v, gust: only.gust }
  }
  const ty = y - r0
  const tx = x - c0
  const a = f.cells[r0 * f.cols + c0]
  const b = f.cells[r0 * f.cols + c0 + 1]
  const c = f.cells[(r0 + 1) * f.cols + c0]
  const d = f.cells[(r0 + 1) * f.cols + c0 + 1]
  if (a === null || b === null || c === null || d === null) return null
  const mix = (p: number, q: number, r: number, s: number) => (p * (1 - tx) + q * tx) * (1 - ty) + (r * (1 - tx) + s * tx) * ty
  const gusts = [a.gust, b.gust, c.gust, d.gust]
  return {
    u: mix(a.u, b.u, c.u, d.u),
    v: mix(a.v, b.v, c.v, d.v),
    gust: gusts.every((g) => g !== null) ? mix(...(gusts as [number, number, number, number])) : null,
  }
}

/* ------------------------------------------------------------- the colours */

export const KT_PER_MPS = 1.9438444924406
/** The board's legend, knots, and the colour at each stop. */
export const SCALE: readonly { kt: number; rgb: [number, number, number] }[] = [
  { kt: 0, rgb: [59, 91, 170] },
  { kt: 5, rgb: [52, 136, 196] },
  { kt: 10, rgb: [43, 179, 160] },
  { kt: 15, rgb: [76, 190, 110] },
  { kt: 20, rgb: [196, 204, 76] },
  { kt: 25, rgb: [232, 176, 74] },
  { kt: 30, rgb: [217, 83, 79] },
]

/** The colour for a speed, m/s, between the scale's stops. */
export function windRgb(speedMps: number): [number, number, number] {
  const kt = speedMps * KT_PER_MPS
  if (kt <= SCALE[0].kt) return SCALE[0].rgb
  for (let i = 1; i < SCALE.length; i += 1) {
    if (kt <= SCALE[i].kt) {
      const t = (kt - SCALE[i - 1].kt) / (SCALE[i].kt - SCALE[i - 1].kt)
      const p = SCALE[i - 1].rgb
      const q = SCALE[i].rgb
      return [0, 1, 2].map((k) => Math.round(p[k] + (q[k] - p[k]) * t)) as [number, number, number]
    }
  }
  return SCALE[SCALE.length - 1].rgb
}

/** The legend's labels in the user's unit: "0 5 10 … 30+" in knots, the same stops converted otherwise. */
export function legendStops(unit: 'kt' | 'mph' | 'kmh' | 'ms'): string[] {
  const per = { kt: 1, mph: 1.150779, kmh: 1.852, ms: 0.514444 }[unit]
  return SCALE.map((s, i) => `${Math.round(s.kt * per)}${i === SCALE.length - 1 ? '+' : ''}`)
}

/* ------------------------------------------------------------- the particles */

/** How many particles for a canvas of this size at this zoom: denser zoomed in, never more than MAX_PARTICLES. */
export const MAX_PARTICLES = 2200
export function particleCount(widthPx: number, heightPx: number, zoom: number): number {
  const perMegapixel = 2600 * Math.min(1.4, Math.max(0.6, zoom / 8))
  return Math.min(MAX_PARTICLES, Math.round(((widthPx * heightPx) / 1e6) * perMegapixel))
}

/** Pixels a particle moves in a second: proportional to the wind speed, the same at any zoom. */
export const PX_PER_S_PER_MPS = 7

/**
 * THE FIELD'S EDGE FADES (Batch Polish 2, Section 1). `rgba` is the colour
 * grid, cols x rows, alpha 0 where the field said nothing. Each painted cell's
 * alpha is scaled by its distance in cells to the nearest unpainted one (or
 * to nothing past the grid's own edge, which is the screen's and does not
 * fade), up to `fadeCells`. Returns whether any cell was unpainted: the wind
 * covers only part of the view.
 */
export function fadeEdges(rgba: Uint8ClampedArray, cols: number, rows: number, fadeCells: number): boolean {
  const far = fadeCells + 1
  const d = new Float32Array(cols * rows)
  let partial = false
  for (let k = 0; k < cols * rows; k += 1) {
    const empty = rgba[k * 4 + 3] === 0
    if (empty) partial = true
    d[k] = empty ? 0 : far
  }
  if (!partial) return false
  /* Two passes of a chamfer distance (1 across, 1.4 diagonal). */
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? far : d[y * cols + x])
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const k = y * cols + x
      if (d[k] === 0) continue
      d[k] = Math.min(d[k], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4)
    }
  }
  for (let y = rows - 1; y >= 0; y -= 1) {
    for (let x = cols - 1; x >= 0; x -= 1) {
      const k = y * cols + x
      if (d[k] === 0) continue
      d[k] = Math.min(d[k], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4)
    }
  }
  for (let k = 0; k < cols * rows; k += 1) {
    if (d[k] === 0 || d[k] >= fadeCells) continue
    rgba[k * 4 + 3] = Math.round(rgba[k * 4 + 3] * (d[k] / fadeCells))
  }
  return true
}

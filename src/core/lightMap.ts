/*
 * THE LIGHT MAP: HOW MANY MINUTES OF DIRECT SUN EACH METRE OF GROUND GETS
 * in a window of time, from the scan's surface (the DSM: roofs, trees,
 * ground) and the sun's path.
 *
 * A cell is in the sun at a moment when nothing the scan measured stands
 * between it and the sun. Two ways (scripts/measure-light-map.mjs):
 *
 *   rays      for each moment, from each cell toward the sun in half-cell
 *             steps, stopping once the ray is above everything in the patch
 *   skylines  for a sample of cells, the cell's whole skyline (src/core/
 *             skyRing.ts) and the sun's path against it: lit while the sun
 *             stands above the skyline in its direction
 *
 * The point looked from is just above the surface (LIFT_M), so a roof or
 * the ground does not shade itself. Beyond the scanned patch nothing is
 * known and nothing casts: a cell near the edge may be shaded by something
 * the scan did not reach, and the map says so.
 */
import { enuToward } from './sky3d.ts'
import { skylineAt, skylineByMarch, type SurfaceGrid } from './skyRing.ts'

export const LIFT_M = 0.3
const R = 6_371_000
const REFRACTION = 0.13

export interface SunStep {
  at: Date
  azimuth: number
  altitude: number
  /** Minutes this step stands for. */
  minutes: number
}

export interface Window {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Whether the sun at (azimuth, altitude) reaches cell (cx, cy): a ray in half-cell steps toward it over the DSM. */
export function litByRay(g: SurfaceGrid, cx: number, cy: number, azimuth: number, altitude: number, top: number): boolean {
  const z0 = g.dsm[cy * g.width + cx]
  if (Number.isNaN(z0)) return false
  return litFrom(g, cx + 0.5, cy + 0.5, z0 + LIFT_M, azimuth, altitude, top)
}

/** Whether the sun reaches the point (x, y in cells from the grid's corner, z metres): the same ray, from any height. */
export function litFrom(g: SurfaceGrid, x: number, y: number, from: number, azimuth: number, altitude: number, top: number): boolean {
  if (altitude <= 0) return false
  const [e, n] = enuToward(azimuth, 0)
  const tanAlt = Math.tan((altitude * Math.PI) / 180)
  /* Half-cell steps: whole ones step over a cell the ray only clips on a diagonal. */
  for (let s = 1; ; s += 1) {
    const c = s * 0.5
    const d = c * g.cellM
    const rayZ = from + d * tanAlt - ((d * d) / (2 * R)) * (1 - REFRACTION)
    if (rayZ > top) return true
    const px = Math.floor(x + e * c)
    const py = Math.floor(y - n * c)
    if (px < 0 || py < 0 || px >= g.width || py >= g.height) return true
    const z = g.dsm[py * g.width + px]
    if (!Number.isNaN(z) && z > rayZ) return false
  }
}

/*
 * THE WALLS. Seen from above the light map shows roofs and ground, and a lit
 * hotel front is a wall: it has no cell of its own. So each built cell with
 * a wall at its edge (a drop of WALL_MIN_M or more to the cell beside it,
 * whatever stands there) is asked about that wall: from a point on it at half its height, just
 * outside, is the sun in front of the wall and nothing in the way? The
 * Oceanfront at sunrise, 27 Oct: the hotels' east fronts lit pink and the
 * ground behind them in shade (scripts/measure-light-map-oceanfront.mjs).
 */
export const WALL_MIN_M = 3
/* The four faces of a cell: the step to the neighbour, and the way the wall faces (degrees from north). */
const FACES: readonly [number, number, number][] = [
  [1, 0, 90],
  [0, -1, 0],
  [-1, 0, 270],
  [0, 1, 180],
]

/** Minutes of direct sun on the walls of each built cell of the window (the most any one of its walls gets); NaN where the cell has no wall. */
export function wallSunMinutes(g: SurfaceGrid & { dtm: Float32Array }, built: (i: number) => boolean, w: Window, steps: readonly SunStep[]): Float32Array {
  const width = w.x1 - w.x0
  const height = w.y1 - w.y0
  const out = new Float32Array(width * height).fill(Number.NaN)
  let top = -Infinity
  for (const z of g.dsm) if (!Number.isNaN(z) && z > top) top = z
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cx = w.x0 + x
      const cy = w.y0 + y
      const i = cy * g.width + cx
      if (!built(i) || Number.isNaN(g.dsm[i])) continue
      let best = Number.NaN
      for (const [dx, dy, faces] of FACES) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= g.width || ny >= g.height) continue
        const j = ny * g.width + nx
        /* A drop of WALL_MIN_M or more is a wall whatever is beside it: a tower over its own podium has one too. */
        if (Number.isNaN(g.dsm[j]) || g.dsm[i] - g.dsm[j] < WALL_MIN_M) continue
        const foot = Number.isNaN(g.dtm[i]) ? g.dsm[j] : Math.max(g.dsm[j], g.dtm[i])
        const midZ = foot + (g.dsm[i] - foot) / 2
        /* Just outside the wall: a tenth of a cell beyond the face, in the open cell. */
        const px = cx + 0.5 + dx * 0.6
        const py = cy + 0.5 + dy * 0.6
        let m = 0
        for (const st of steps) {
          const facing = Math.cos(((st.azimuth - faces) * Math.PI) / 180) > 0
          if (facing && litFrom(g, px, py, midZ, st.azimuth, st.altitude, top)) m += st.minutes
        }
        best = Number.isNaN(best) ? m : Math.max(best, m)
      }
      out[y * width + x] = best
    }
  }
  return out
}

/** Minutes of direct sun per cell of the window, by rays. NaN where the scan measured nothing. */
export function sunMinutesByRays(g: SurfaceGrid, w: Window, steps: readonly SunStep[]): Float32Array {
  const width = w.x1 - w.x0
  const height = w.y1 - w.y0
  const out = new Float32Array(width * height)
  let top = -Infinity
  for (const z of g.dsm) if (!Number.isNaN(z) && z > top) top = z
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cx = w.x0 + x
      const cy = w.y0 + y
      if (Number.isNaN(g.dsm[cy * g.width + cx])) {
        out[y * width + x] = Number.NaN
        continue
      }
      let m = 0
      for (const s of steps) if (litByRay(g, cx, cy, s.azimuth, s.altitude, top)) m += s.minutes
      out[y * width + x] = m
    }
  }
  return out
}

/** Minutes of direct sun at one cell by its skyline (the second way). */
/* Sectors of 0.1 deg: a fifth of the sun's disc, so the skyline asks about the sun's centre, as the ray does. */
export function sunMinutesBySkyline(g: SurfaceGrid, cx: number, cy: number, steps: readonly SunStep[], binDeg = 0.1): number {
  const z = g.dsm[cy * g.width + cx]
  if (Number.isNaN(z)) return Number.NaN
  /* Everything counts here, the wall a metre away included: it shades the cell. */
  const s = skylineByMarch(g, cx + 0.5, cy + 0.5, z + LIFT_M, binDeg, Infinity, 0.75)
  let m = 0
  for (const st of steps) if (st.altitude > 0 && st.altitude > skylineAt(s, st.azimuth)) m += st.minutes
  return m
}

/** The sun through a window, every `everyMin` minutes, each step standing for that many minutes. */
export function sunSteps(from: Date, to: Date, everyMin: number, position: (at: Date) => { azimuth: number; altitude: number }): SunStep[] {
  const out: SunStep[] = []
  const span = to.getTime() - from.getTime()
  if (span <= 0) return out
  const n = Math.max(1, Math.round(span / (everyMin * 60_000)))
  const minutes = span / n / 60_000
  for (let i = 0; i < n; i += 1) {
    const at = new Date(from.getTime() + (i + 0.5) * minutes * 60_000)
    const p = position(at)
    out.push({ at, azimuth: p.azimuth, altitude: p.altitude, minutes })
  }
  return out
}

/*
 * THE SKYLINE: HOW HIGH THE WORLD STANDS IN EVERY DIRECTION, from one spot.
 *
 * From the scan's surface (the DSM: roofs, trees and ground, a metre a cell)
 * at eye height or a drone's, the angle above level of the highest thing in
 * each direction, all the way round. Under the sun's and moon's paths it says
 * when the sun drops behind something, and how long before sunset.
 *
 * Two ways, which must agree (scripts/measure-skyline.mjs):
 *
 *   march   from the spot outward in half-cell steps, a ray every SUB_DEG
 *           across each bin, reading the surface where the ray is, keeping
 *           the steepest angle
 *   bins    every cell of the patch once: its angle from the spot, put in the
 *           bin of its bearing (and the bins its width spans, near the spot),
 *           keeping the steepest per bin
 *
 * Angles include the Earth's curve and ordinary refraction: something d away
 * stands lower by d^2 (1 - k) / 2R, k = 0.13. Over a 1.5 km patch that is
 * 15 cm at the edge.
 */
const R = 6_371_000
const REFRACTION = 0.13

export interface SurfaceGrid {
  width: number
  height: number
  /** Metres a cell. */
  cellM: number
  /** The surface, metres; NaN where nothing was measured. Row 0 is north. */
  dsm: Float32Array
}

export interface Skyline {
  /** Bins of BIN_DEG, the first centred on north, clockwise. */
  binDeg: number
  /** Angle above level of the highest thing in each bin, degrees; -90 where nothing in the patch is in that direction. */
  angle: Float32Array
  /** The cell that sets it, or -1. */
  cell: Int32Array
  /** How far away it is, metres. */
  distanceM: Float32Array
}

const drop = (d: number) => ((d * d) / (2 * R)) * (1 - REFRACTION)

const angleOf = (rise: number, d: number) => (Math.atan2(rise - drop(d), d) * 180) / Math.PI

function empty(bins: number, binDeg: number): Skyline {
  return { binDeg, angle: new Float32Array(bins).fill(-90), cell: new Int32Array(bins).fill(-1), distanceM: new Float32Array(bins).fill(Number.NaN) }
}

/*
 * BOTH WAYS MEAN THE SAME THING: the highest thing anywhere in each bin's
 * sector, not on its centre line. A 1 deg sector is 7 m wide at 400 m, and a
 * centre line alone missed a taller tree a few metres to its side (Brew
 * River, 27 Oct: the two ways then disagreed on when the sun went behind
 * it). The march sends a ray every SUB_DEG across the sector.
 *
 * WHAT IS LEFT OUT: things within NEAR_M of the spot. The spot is one cell
 * of a metre grid, and at a metre a single cell spans 53 deg of view, so the
 * two ways cannot agree there and neither is the skyline: it is the railing
 * or the wall you are standing at. The sheet says so.
 */
export const SUB_DEG = 0.05
export const NEAR_M = 2

/** By marching out across each bin's sector. `x`, `y` in cells (x east, y south); `eyeM` the eye's height on the same datum as the surface. */
export function skylineByMarch(g: SurfaceGrid, x: number, y: number, eyeM: number, binDeg = 1, maxM = Infinity, nearM = NEAR_M): Skyline {
  const bins = Math.round(360 / binDeg)
  const out = empty(bins, binDeg)
  const rays = Math.max(1, Math.round(binDeg / SUB_DEG))
  for (let b = 0; b < bins; b += 1) {
    for (let k = 0; k < rays; k += 1) {
      const az = ((b * binDeg - binDeg / 2 + ((k + 0.5) * binDeg) / rays) * Math.PI) / 180
      const dx = Math.sin(az)
      const dy = -Math.cos(az)
      for (let s = 1; ; s += 1) {
        const dCells = s * 0.5
        const d = dCells * g.cellM
        if (d > maxM) break
        const cx = Math.floor(x + dx * dCells)
        const cy = Math.floor(y + dy * dCells)
        if (cx < 0 || cy < 0 || cx >= g.width || cy >= g.height) break
        /* The cell's own distance, to its centre, as the bins take it: along the ray it could be its near edge, and a 10 m tree 3 m off reads atan(10 / 2.5) = 76 deg there against atan(10 / 3) = 73 at its centre. */
        const dc = Math.hypot(cx + 0.5 - x, cy + 0.5 - y) * g.cellM
        if (dc < nearM) continue
        const i = cy * g.width + cx
        const z = g.dsm[i]
        if (Number.isNaN(z)) continue
        const a = angleOf(z - eyeM, dc)
        if (a > out.angle[b]) {
          out.angle[b] = a
          out.cell[b] = i
          out.distanceM[b] = dc
        }
      }
    }
  }
  return out
}

/** By visiting every cell once and binning it by bearing; a near cell is put in every bin its width covers. */
export function skylineByBins(g: SurfaceGrid, x: number, y: number, eyeM: number, binDeg = 1, maxM = Infinity, nearM = NEAR_M): Skyline {
  const bins = Math.round(360 / binDeg)
  const out = empty(bins, binDeg)
  for (let cy = 0; cy < g.height; cy += 1) {
    for (let cx = 0; cx < g.width; cx += 1) {
      const i = cy * g.width + cx
      const z = g.dsm[i]
      if (Number.isNaN(z)) continue
      const ex = cx + 0.5 - x
      const ny = y - (cy + 0.5)
      const dCells = Math.hypot(ex, ny)
      const d = dCells * g.cellM
      if (d < nearM) continue
      if (d > maxM) continue
      const a = angleOf(z - eyeM, d)
      const az = ((Math.atan2(ex, ny) * 180) / Math.PI + 360) % 360
      /* Half the cell's angular width, either side. */
      const half = (Math.atan2(0.5, dCells) * 180) / Math.PI
      /* Every bin whose sector the cell overlaps: bin b covers b x binDeg +- binDeg / 2. */
      const first = Math.floor((az - half) / binDeg + 0.5)
      const last = Math.floor((az + half) / binDeg + 0.5)
      for (let k = first; k <= last; k += 1) {
        const b = ((k % bins) + bins) % bins
        if (a > out.angle[b]) {
          out.angle[b] = a
          out.cell[b] = i
          out.distanceM[b] = d
        }
      }
    }
  }
  return out
}

/** The skyline's angle at a bearing, degrees, interpolated between bins. */
export function skylineAt(s: Skyline, azimuthDeg: number): number {
  const bins = s.angle.length
  const f = (((azimuthDeg % 360) + 360) % 360) / s.binDeg
  const a = Math.floor(f) % bins
  const b = (a + 1) % bins
  const t = f - Math.floor(f)
  return s.angle[a] * (1 - t) + s.angle[b] * t
}

export interface SunPoint {
  at: Date
  azimuth: number
  altitude: number
}

export interface Crossing {
  /** When the body goes behind (or comes out from) what stands in its direction. */
  at: Date
  kind: 'hidden' | 'shows'
  /** The bin whose highest thing it crosses. */
  bin: number
}

/**
 * Where a path (sun or moon, in order) crosses the skyline, while it is above
 * the true horizon: each change between above and below what stands in its
 * direction, the moment found by interpolating between the two samples.
 */
export function crossings(s: Skyline, path: readonly SunPoint[]): Crossing[] {
  const out: Crossing[] = []
  let prev: { p: SunPoint; over: number } | null = null
  for (const p of path) {
    if (p.altitude < -0.833) {
      prev = null
      continue
    }
    const over = p.altitude - skylineAt(s, p.azimuth)
    if (prev !== null && Math.sign(over) !== Math.sign(prev.over) && over !== prev.over) {
      const t = prev.over / (prev.over - over)
      const at = new Date(prev.p.at.getTime() + t * (p.at.getTime() - prev.p.at.getTime()))
      const az = prev.p.azimuth + t * (p.azimuth - prev.p.azimuth)
      /* Only where something stands above level: below it, the crossing is the sun rising or setting over open water or flat land, not going behind anything. */
      if (skylineAt(s, az) > 0) out.push({ at, kind: over < 0 ? 'hidden' : 'shows', bin: Math.round(az / s.binDeg) % s.angle.length })
    }
    prev = { p, over }
  }
  return out
}

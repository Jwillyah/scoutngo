/*
 * PREFLIGHT: A DRONE MOVE AS A PATH, AND WHAT THE PATH MEANS. All arithmetic;
 * the screens only draw it. Every number on the flight card is worked out two
 * independent ways and a test holds them together (the double-math rule).
 *
 * HEIGHTS are feet above the takeoff point, the way the Air 3S shows them,
 * and never above the lower of the grid ceiling and the ceiling you were
 * approved for: a move asked to go higher is held at the cap and the card
 * says so.
 *
 * THIS NEVER SAYS A FLIGHT IS SAFE, LEGAL OR CLEAR. It reports distances,
 * clearances to what the scan and the map know of, and the stretches it can
 * see a problem in. The card always ends with FLIGHT_CARD_CLOSE.
 */
import { bearingBetween, destinationPoint, distanceMeters, type LatLon } from './geo.ts'

export const FT = 0.3048
export const FLIGHT_CARD_CLOSE = 'Pull LAANC, check TFRs, look at the site.'
/* DJI Air 3S, from DJI's published specifications (dji.com/air-3s/specs): editable in the move's settings. */
export const AIR3S = { flightMinutes: 45, maxSpeedMps: 21, maxClimbMps: 10, maxDescentMps: 10, maxWindMps: 12 } as const
/* What is left in the battery when the card draws its reserve line. */
export const RESERVE_SHARE = 0.25
/* A pilot's eye, metres over the ground they stand on. */
export const EYE_M = 1.6

export type Move =
  | { kind: 'orbit'; centre: LatLon; radiusM: number; heightFt: number; startBearing: number; sweepDeg: number; clockwise: boolean }
  | { kind: 'push-in'; from: LatLon; subject: LatLon; heightFt: number }
  | { kind: 'pull-back'; from: LatLon; subject: LatLon; heightFt: number }
  | { kind: 'rise'; at: LatLon; fromFt: number; toFt: number }
  | { kind: 'fly-along'; points: LatLon[]; heightFt: number }
  | { kind: 'waypoints'; points: { at: LatLon; heightFt: number }[] }

export interface PathPoint {
  /** Seconds from the start. */
  t: number
  at: LatLon
  /** Feet above takeoff, after the cap. */
  ft: number
  /** Feet asked for before the cap. */
  askedFt: number
}

export interface PathOptions {
  speedMps: number
  /** The lower of the grid ceiling and your approved ceiling, feet. */
  capFt: number
  /** Seconds between samples. */
  stepS?: number
}

/** The move's waypoints in order, before timing: the shape of the path. */
export function moveVertices(move: Move): { at: LatLon; ft: number }[] {
  switch (move.kind) {
    case 'orbit': {
      const n = Math.max(2, Math.ceil(Math.abs(move.sweepDeg) / 2) + 1)
      return Array.from({ length: n }, (_, i) => {
        const b = move.startBearing + (move.clockwise ? 1 : -1) * (move.sweepDeg * i) / (n - 1)
        return { at: destinationPoint(move.centre, b, move.radiusM), ft: move.heightFt }
      })
    }
    case 'push-in':
      return [
        { at: move.from, ft: move.heightFt },
        { at: destinationPoint(move.from, bearingBetween(move.from, move.subject), distanceMeters(move.from, move.subject) * 0.6), ft: move.heightFt },
      ]
    case 'pull-back':
      return [
        { at: move.from, ft: move.heightFt },
        { at: destinationPoint(move.from, bearingBetween(move.subject, move.from), distanceMeters(move.from, move.subject) * 0.6), ft: move.heightFt },
      ]
    case 'rise':
      return [
        { at: move.at, ft: move.fromFt },
        { at: move.at, ft: move.toFt },
      ]
    case 'fly-along':
      return move.points.map((at) => ({ at, ft: move.heightFt }))
    case 'waypoints':
      return move.points.map((p) => ({ at: p.at, ft: p.heightFt }))
  }
}

const segLength = (a: { at: LatLon; ft: number }, b: { at: LatLon; ft: number }) => Math.hypot(distanceMeters(a.at, b.at), (b.ft - a.ft) * FT)

/** The path in time, sampled every stepS at a steady speed along its 3D length. */
export function pathFor(move: Move, opts: PathOptions): PathPoint[] {
  const step = opts.stepS ?? 0.5
  const verts = moveVertices(move)
  if (verts.length === 0) return []
  const out: PathPoint[] = [{ t: 0, at: verts[0].at, ft: Math.min(verts[0].ft, opts.capFt), askedFt: verts[0].ft }]
  let t = 0
  for (let i = 1; i < verts.length; i += 1) {
    const a = verts[i - 1]
    const b = verts[i]
    const len = segLength(a, b)
    const dur = len / Math.max(0.1, opts.speedMps)
    const brg = bearingBetween(a.at, b.at)
    const flat = distanceMeters(a.at, b.at)
    for (let s = step - (t % step || 0); s <= dur + 1e-9; s += step) {
      const f = dur === 0 ? 1 : s / dur
      const ft = a.ft + (b.ft - a.ft) * f
      out.push({ t: t + s, at: flat === 0 ? a.at : destinationPoint(a.at, brg, flat * f), ft: Math.min(ft, opts.capFt), askedFt: ft })
    }
    t += dur
  }
  const last = verts[verts.length - 1]
  if (out[out.length - 1].t < t - 1e-6) out.push({ t, at: last.at, ft: Math.min(last.ft, opts.capFt), askedFt: last.ft })
  return out
}

/* ---------------------------------------------------------- the card, two ways */

/** Path length, metres: along the sampled points (A), and from the move's own shape (B). */
export function pathLengthSampled(path: readonly PathPoint[]): number {
  let m = 0
  for (let i = 1; i < path.length; i += 1) m += Math.hypot(distanceMeters(path[i - 1].at, path[i].at), (path[i].ft - path[i - 1].ft) * FT)
  return m
}

export function pathLengthFormula(move: Move, capFt: number): number {
  switch (move.kind) {
    case 'orbit':
      /* An arc: radius times the angle, with no climb. */
      return move.radiusM * ((Math.abs(move.sweepDeg) * Math.PI) / 180)
    case 'rise':
      return Math.abs(Math.min(move.toFt, capFt) - Math.min(move.fromFt, capFt)) * FT
    default: {
      const v = moveVertices(move).map((p) => ({ at: p.at, ft: Math.min(p.ft, capFt) }))
      let m = 0
      for (let i = 1; i < v.length; i += 1) m += segLength(v[i - 1], v[i])
      return m
    }
  }
}

export interface Heights {
  /** Ground, metres, at a point (the scan's DTM, else the map's elevation). */
  groundAt: (at: LatLon) => number | null
  /** The top of whatever stands there (the scan's DSM), metres, or null where unknown. */
  surfaceAt: (at: LatLon) => number | null
}

export interface Clearance {
  /** Metres between the drone and the highest surface within CLEAR_RADIUS_M, at the closest point. */
  metres: number
  at: LatLon
  t: number
}

export const CLEAR_RADIUS_M = 5

/** Closest clearance over the scan's surface (A: the raster). */
export function clearanceBySurface(path: readonly PathPoint[], takeoff: LatLon, h: Heights): Clearance | null {
  const base = h.groundAt(takeoff)
  if (base === null) return null
  let best: Clearance | null = null
  for (const p of path) {
    let top = h.surfaceAt(p.at)
    for (let b = 0; b < 360; b += 45) {
      const s = h.surfaceAt(destinationPoint(p.at, b, CLEAR_RADIUS_M))
      if (s !== null && (top === null || s > top)) top = s
    }
    if (top === null) continue
    const m = base + p.ft * FT - top
    if (best === null || m < best.metres) best = { metres: m, at: p.at, t: p.t }
  }
  return best
}

/** Closest clearance over solid boxes (B: footprints with heights on the ground): a different source for the same roofs. */
export function clearanceByBoxes(path: readonly PathPoint[], takeoff: LatLon, h: Heights, boxes: readonly { ring: [number, number][]; topM: number }[]): Clearance | null {
  const base = h.groundAt(takeoff)
  if (base === null) return null
  const inside = (ring: [number, number][], at: LatLon) => {
    let c = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[j]
      if (y1 > at.lat !== y2 > at.lat && at.lon < ((x2 - x1) * (at.lat - y1)) / (y2 - y1) + x1) c = !c
    }
    return c
  }
  let best: Clearance | null = null
  for (const p of path) {
    let top: number | null = null
    for (const b of [0, 45, 90, 135, 180, 225, 270, 315, -1]) {
      const at = b < 0 ? p.at : destinationPoint(p.at, b, CLEAR_RADIUS_M)
      for (const box of boxes) if (inside(box.ring, at) && (top === null || box.topM > top)) top = box.topM
      const g = h.groundAt(at)
      if (g !== null && (top === null || g > top)) top = g
    }
    if (top === null) continue
    const m = base + p.ft * FT - top
    if (best === null || m < best.metres) best = { metres: m, at: p.at, t: p.t }
  }
  return best
}

/** Is the drone at `p` hidden from the pilot's eye? A: march the ray, any surface above it hides. */
export function hiddenByMarch(pilot: LatLon, p: PathPoint, h: Heights, stepM = 1): boolean {
  const g = h.groundAt(pilot)
  if (g === null) return false
  const eye = g + EYE_M
  const drone = g + p.ft * FT
  const d = distanceMeters(pilot, p.at)
  if (d < 2) return false
  const brg = bearingBetween(pilot, p.at)
  for (let s = stepM; s < d - stepM; s += stepM) {
    const top = h.surfaceAt(destinationPoint(pilot, brg, s))
    if (top === null) continue
    if (top > eye + ((drone - eye) * s) / d) return true
  }
  return false
}

/** B: the horizon. The highest angle anything along the way stands at, against the angle up to the drone. */
export function hiddenByHorizon(pilot: LatLon, p: PathPoint, h: Heights, stepM = 1): boolean {
  const g = h.groundAt(pilot)
  if (g === null) return false
  const eye = g + EYE_M
  const d = distanceMeters(pilot, p.at)
  if (d < 2) return false
  const brg = bearingBetween(pilot, p.at)
  let horizon = -Infinity
  for (let s = stepM; s < d - stepM; s += stepM) {
    const top = h.surfaceAt(destinationPoint(pilot, brg, s))
    if (top !== null) horizon = Math.max(horizon, Math.atan2(top - eye, s))
  }
  return Math.atan2(g + p.ft * FT - eye, d) < horizon
}

/** Runs of samples, as [from t, to t], where `flag` holds. */
export function stretches(path: readonly PathPoint[], flag: (p: PathPoint) => boolean): [number, number][] {
  const out: [number, number][] = []
  let open: number | null = null
  for (let i = 0; i < path.length; i += 1) {
    const on = flag(path[i])
    if (on && open === null) open = path[i].t
    if (!on && open !== null) {
      out.push([open, path[i - 1].t])
      open = null
    }
  }
  if (open !== null) out.push([open, path[path.length - 1].t])
  return out
}

export type LegWind = 'headwind' | 'tailwind' | 'crosswind'

/** The wind on a leg flown along `track`: `windFrom` is where it comes from. */
export function legWind(track: number, windFrom: number): LegWind {
  const to = (windFrom + 180) % 360
  const d = Math.abs((((track - to) % 360) + 540) % 360 - 180)
  if (d <= 45) return 'tailwind'
  if (d >= 135) return 'headwind'
  return 'crosswind'
}

export interface Battery {
  usedMin: number
  /** Minutes before the reserve line. */
  usableMin: number
  overReserve: boolean
}

export function battery(durationS: number, flightMinutes: number = AIR3S.flightMinutes): Battery {
  const usedMin = durationS / 60
  const usableMin = flightMinutes * (1 - RESERVE_SHARE)
  return { usedMin, usableMin, overReserve: usedMin > usableMin }
}

/* ------------------------------------------------------------------ export */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** GPX 1.1: a track of the path, elevation as metres above the takeoff point's ground plus `groundM`. */
export function toGpx(name: string, path: readonly PathPoint[], groundM: number, start: Date): string {
  const pts = path.map((p) => `<trkpt lat="${p.at.lat.toFixed(7)}" lon="${p.at.lon.toFixed(7)}"><ele>${(groundM + p.ft * FT).toFixed(1)}</ele><time>${new Date(start.getTime() + p.t * 1000).toISOString()}</time></trkpt>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ScoutNGo" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name)}</name><trkseg>${pts.join('')}</trkseg></trk></gpx>\n`
}

/** KML: the path as a line, altitude relative to the ground. */
export function toKml(name: string, path: readonly PathPoint[]): string {
  const coords = path.map((p) => `${p.at.lon.toFixed(7)},${p.at.lat.toFixed(7)},${(p.ft * FT).toFixed(1)}`).join(' ')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name><Placemark><name>${esc(name)}</name><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark></Document></kml>\n`
}

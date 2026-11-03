/*
 * WARNINGS UPSTREAM (Batch L, Section 4). The warning card said only the
 * warnings whose polygon holds the venue. A storm warned 15 miles west and
 * moving east is the one coming; this finds it.
 *
 * UPSTREAM: the polygon is within UPSTREAM_KM of the venue (its nearest
 * edge), does not hold the venue, and the storm's motion, as the NWS gives
 * it in the warning ("...storm...236DEG...21KT...32.52,-93.21 ..." : the
 * direction it moves FROM, its speed, and the line of the storm), points at
 * the venue: the bearing from the storm's line to the venue within
 * TOWARD_DEG of where it is heading. With no motion in the warning, the
 * radar's cell flow stands in, and the card says so.
 *
 * Arithmetic only; said as a fact ("Severe Thunderstorm Warning 18 mi W ·
 * moving E 25 mph toward you"), never advice.
 */
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { angleApart } from './coastFacing.ts'

export const UPSTREAM_KM = 48.28 /* 30 mi */
export const TOWARD_DEG = 35

export interface Motion {
  /** Where it moves from, degrees (the NWS's DEG). */
  fromDeg: number
  kt: number
  /** The storm's line: the points after the speed. */
  line: LatLon[]
}

/** The NWS's eventMotionDescription, or null when it is not one. */
export function parseMotion(desc: string | null | undefined): Motion | null {
  if (typeof desc !== 'string') return null
  const m = /\.\.\.(\d{1,3})DEG\.\.\.(\d{1,3})KT\.\.\.([-\d.,\s]+)$/.exec(desc.trim())
  if (m === null) return null
  const line = m[3]
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([lat, lon]) => ({ lat, lon }))
  return { fromDeg: Number(m[1]) % 360, kt: Number(m[2]), line }
}

/** Ray casting on lon/lat: fine at warning size. */
export function inPolygon(p: LatLon, poly: GeoJSON.Polygon): boolean {
  const ring = poly.coordinates[0] ?? []
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** The polygon's nearest point to the venue, along its edges (flat km about the venue). */
export function nearestOnPolygon(p: LatLon, poly: GeoJSON.Polygon): { km: number; at: LatLon } | null {
  const ring = poly.coordinates[0] ?? []
  if (ring.length < 2) return null
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180)
  const ky = 110.57
  let best: { km: number; at: LatLon } | null = null
  for (let i = 0; i + 1 < ring.length; i += 1) {
    const ax = (ring[i][0] - p.lon) * kx
    const ay = (ring[i][1] - p.lat) * ky
    const bx = (ring[i + 1][0] - p.lon) * kx
    const by = (ring[i + 1][1] - p.lat) * ky
    const dx = bx - ax
    const dy = by - ay
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
    const x = ax + t * dx
    const y = ay + t * dy
    const km = Math.hypot(x, y)
    if (best === null || km < best.km) best = { km, at: { lat: p.lat + y / ky, lon: p.lon + x / kx } }
  }
  return best
}

export interface Upstream {
  km: number
  /** From the venue to the warning's nearest edge. */
  bearingDeg: number
  /** Where the storm is heading, degrees. */
  towardDeg: number
  kt: number
  /** Minutes until the nearest edge reaches the venue at that speed; null when the speed is nil. */
  etaMin: number | null
  /** 'nws' when the warning gave its motion, 'radar' when the cells' flow stood in. */
  motionFrom: 'nws' | 'radar'
}

/**
 * Whether a warning's storm is upstream of the venue: near, not over it,
 * and heading at it. `flow` is the radar cells' heading and speed, for a
 * warning that gives no motion.
 */
export function upstream(venue: LatLon, polygon: GeoJSON.Polygon | null, motion: Motion | null, flow: { towardDeg: number; kt: number } | null = null): Upstream | null {
  if (polygon === null || inPolygon(venue, polygon)) return null
  const edge = nearestOnPolygon(venue, polygon)
  if (edge === null || edge.km > UPSTREAM_KM) return null
  const towardDeg = motion !== null ? (motion.fromDeg + 180) % 360 : flow?.towardDeg ?? null
  const kt = motion?.kt ?? flow?.kt ?? null
  if (towardDeg === null || kt === null) return null
  /* From the storm to the venue: from its own line when given, else from the polygon's nearest edge. */
  const from = motion !== null && motion.line.length > 0 ? motion.line.reduce((a, b) => (distanceMeters(b, venue) < distanceMeters(a, venue) ? b : a)) : edge.at
  if (angleApart(bearingBetween(from, venue), towardDeg) > TOWARD_DEG) return null
  const kmh = kt * 1.852
  return { km: edge.km, bearingDeg: bearingBetween(venue, edge.at), towardDeg, kt, etaMin: kmh <= 0 ? null : Math.round((edge.km / kmh) * 60), motionFrom: motion !== null ? 'nws' : 'radar' }
}

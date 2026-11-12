/*
 * WHERE'S THE COLOR TONIGHT? (Batch BEST SKY, Section 1; Jwilly, 12 Nov:
 * clouds are patchy, so the best sunrise or sunset isn't always where you
 * are). A grid of the area, every point scored the Sky fire way, all on the
 * phone:
 *
 *   tiles     5 x 5 points on the forecast cache's own grid (api/forecast.ts:
 *             multiples of 0.05°, at most 25 points a question), each tile a
 *             fixed square, so a question names a tile and an hour, never
 *             you. 0.05° (about 5 km) to 15 mi, 0.1° at 30, 0.2° at 60.
 *   canvas    mid or high cloud 25-80% overhead, or within about 50 km toward
 *             the sun: something to light, with gaps in it
 *   gap       the low cloud along the sun's bearing, here and as far as the
 *             grid and the sun's own path reach (300 km): mostly clear
 *   blocked   a thick low deck overhead: nothing gets under it
 *   patch     within 3 h of the event, the satellite's cold cloud tops over a
 *             point where the models smeared the cloud thin (lib)
 *
 * Words are facts on a scale: Likely, Possible, Little. Never a promise.
 */
import { bearingBetween, destinationPoint, distanceMeters, type LatLon } from './geo.ts'
import { compassPoint } from './field.ts'

export const RADII_MI = [5, 15, 30, 60] as const
export type RadiusMi = (typeof RADII_MI)[number]
const KM_PER_MI = 1.609344

/** The grid's spacing for a radius, degrees: on the forecast cache's 0.05° grid. */
export function gridSpacing(radiusMi: RadiusMi): number {
  return radiusMi <= 15 ? 0.05 : radiusMi <= 30 ? 0.1 : 0.2
}

/** The centre the grid is laid round: the spot rounded to 0.05°, never finer. */
export const roundedCentre = (at: LatLon): LatLon => ({ lat: Math.round(at.lat * 20) / 20, lon: Math.round(at.lon * 20) / 20 })

export interface Tile {
  /** The south-west point, on the spacing's grid. */
  south: number
  west: number
  spacing: number
  /** 5 x 5 points, row by row from the south-west. */
  points: LatLon[]
}

const fix = (v: number) => Number(v.toFixed(2))

/** The fixed tiles whose points fall within `radiusMi` of the rounded centre. */
export function gridTiles(spot: LatLon, radiusMi: RadiusMi): Tile[] {
  const c = roundedCentre(spot)
  const d = gridSpacing(radiusMi)
  const size = 5 * d
  const rKm = radiusMi * KM_PER_MI
  const dLat = rKm / 111.32
  const dLon = rKm / (111.32 * Math.cos((c.lat * Math.PI) / 180))
  const s0 = Math.floor((c.lat - dLat) / size + 1e-9) * size
  const w0 = Math.floor((c.lon - dLon) / size + 1e-9) * size
  const out: Tile[] = []
  for (let s = s0; s < c.lat + dLat; s += size) {
    for (let w = w0; w < c.lon + dLon; w += size) {
      const points: LatLon[] = []
      for (let i = 0; i < 5; i += 1) for (let j = 0; j < 5; j += 1) points.push({ lat: fix(s + i * d), lon: fix(w + j * d) })
      if (points.some((p) => distanceMeters(c, p) / 1000 <= rKm)) out.push({ south: fix(s), west: fix(w), spacing: d, points })
    }
  }
  return out
}

/** A point's cloud at the event's hour, %. */
export interface PointSky extends LatLon {
  low: number | null
  mid: number | null
  high: number | null
  /** The satellite saw cold cloud tops over it in the nowcast window (a patch the models smear); null when not asked. */
  satPatch?: boolean | null
}

export type ColorWord = 'Likely' | 'Possible' | 'Little'

export interface ScoredPoint extends LatLon {
  canvas: number
  /** The canvas over the point itself, a real one (CANVAS_FROM up, or the satellite's patch): what lights up for anyone under it, whichever way they face. Thin cloud lights only toward the sun. */
  overhead: number
  gap: number
  blocked: boolean
  score: number
  word: ColorWord
  /** In three words or so: "patch overhead", "gap open WSW". */
  why: string[]
}

export const CANVAS_FROM = 25
export const CANVAS_TO = 80
export const CANVAS_REACH_KM = 50
export const GAP_REACH_KM = 300
export const BLOCK_LOW = 70
/** A canvas within reach toward the sun counts this much of one overhead. */
export const NEAR_WEIGHT = 0.45
export const LIKELY_FROM = 0.5
export const POSSIBLE_FROM = 0.25

/** How good a cover is as a canvas, 0-1: best between 25 and 80%, thin below, a lid above. */
export function canvasOf(cover: number | null): number {
  if (cover === null || !Number.isFinite(cover)) return 0
  if (cover < CANVAS_FROM) return Math.max(0, cover / CANVAS_FROM) * 0.6
  if (cover <= CANVAS_TO) return 1
  return Math.max(0, (100 - cover) / (100 - CANVAS_TO))
}

const upper = (p: PointSky) => Math.max(p.mid ?? 0, p.high ?? 0)

/**
 * Every point's score for one sunrise or sunset. `sunAzDeg`: the sun's
 * bearing at the event. `farLow`: the low cloud along the sun's path past the
 * grid, out to GAP_REACH_KM, % (the Sky fire path's), or null.
 */
export function scoreGrid(points: readonly PointSky[], sunAzDeg: number, farLow: number | null = null): ScoredPoint[] {
  const toward = compassPoint(sunAzDeg)
  return points.map((p) => {
    const blocked = (p.low ?? 0) >= BLOCK_LOW
    /* Toward the sun: the grid's points within ±30° of its bearing. */
    const ahead = points.filter((q) => q !== p && Math.abs((((bearingBetween(p, q) - sunAzDeg) % 360) + 540) % 360 - 180) <= 30)
    const near = ahead.filter((q) => distanceMeters(p, q) / 1000 <= CANVAS_REACH_KM)
    const overhead = canvasOf(upper(p))
    const nearBest = near.reduce((m, q) => Math.max(m, canvasOf(upper(q))), 0)
    const patch = p.satPatch === true
    /* A patch toward the sun is a low glow on the horizon for anyone with the view, never the sky overhead lit: Possible at most (11 Nov: the clear oceanfront, "not a banger"). */
    const canvas = Math.max(overhead, nearBest * NEAR_WEIGHT, patch ? 0.9 : 0)
    const lows = [...ahead.map((q) => q.low ?? 0), ...(farLow === null ? [] : [farLow])]
    const meanLow = lows.length === 0 ? (p.low ?? 0) : lows.reduce((a, b) => a + b, 0) / lows.length
    const gap = Math.max(0, 1 - meanLow / 100)
    const score = blocked ? 0 : canvas * gap
    const word: ColorWord = score >= LIKELY_FROM ? 'Likely' : score >= POSSIBLE_FROM ? 'Possible' : 'Little'
    const why = [
      blocked ? 'low deck overhead' : patch || overhead >= 0.8 ? 'patch overhead' : nearBest >= 0.8 ? `patch to the ${toward}` : upper(p) < 10 && nearBest < 0.3 ? 'clear sky' : 'thin cloud',
      gap >= 0.7 ? `gap open ${toward}` : gap >= 0.4 ? `gap partly ${toward}` : `gap shut ${toward}`,
    ]
    return { lat: p.lat, lon: p.lon, canvas, overhead: Math.max(upper(p) >= CANVAS_FROM ? overhead : 0, patch ? 0.9 : 0), gap, blocked, score, word, why }
  })
}

/** The score at a place: the nearest grid point's. */
export function scoreAt(grid: readonly ScoredPoint[], at: LatLon): ScoredPoint | null {
  let best: ScoredPoint | null = null
  let bestD = Infinity
  for (const g of grid) {
    const d = distanceMeters(g, at)
    if (d < bestD) {
      bestD = d
      best = g
    }
  }
  return best
}

/** "6 mi NW": straight-line distance and bearing from you, on the phone. */
export function distanceWords(from: LatLon, to: LatLon, miles: boolean): string {
  const km = distanceMeters(from, to) / 1000
  const n = miles ? km / KM_PER_MI : km
  return `${Math.max(1, Math.round(n))} ${miles ? 'mi' : 'km'} ${compassPoint(bearingBetween(from, to))}`
}

/** A point at a bearing and distance, for tests and the map's labels. */
export const offset = (at: LatLon, bearingDeg: number, km: number): LatLon => destinationPoint(at, bearingDeg, km * 1000)

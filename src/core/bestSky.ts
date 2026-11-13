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
 *   afterglow the opposite sky (Batch NOW, Section 0; src/core/afterglow.ts):
 *             broken low or mid cloud within 50 km and 60° of the anti-solar
 *             bearing, lit pink after the sunset when the light gets in;
 *             the Belt of Venus over a clear one
 *
 * Words are facts on a scale: Likely, Possible, Little. Never a promise.
 */
import { antiSolar, apartDeg, OPPOSITE_SPREAD_DEG, readAfterglow } from './afterglow.ts'
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
  /** The 500 hPa wind there (km/h, from), which carries the patch (src/core/satDrift.ts). */
  wind500?: { kmh: number | null; fromDeg: number | null }
}

export type ColorWord = 'Likely' | 'Possible' | 'Little'

export interface ScoredPoint extends LatLon {
  /** The cloud toward the sun lit: what a spot facing the sun sees. */
  sunScore: number
  /** The sunScore's reasons, as `why`. */
  sunWhy: string[]
  /** The opposite sky's pink (or the Belt of Venus): what a spot facing away sees, 0-0.6. */
  glow: number
  glowFires: boolean
  belt: boolean
  canvas: number
  /** The canvas over the point itself, a real one (CANVAS_FROM up, or the satellite's patch): what lights up for anyone under it, whichever way they face. Thin cloud lights only toward the sun. */
  overhead: number
  gap: number
  blocked: boolean
  /** The better of the two: turn round. */
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
  const anti = antiSolar(sunAzDeg)
  const away = compassPoint(anti)
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
    const sunScore = blocked ? 0 : canvas * gap
    /* The opposite sky: the grid's points within reach and OPPOSITE_SPREAD_DEG of the anti-solar bearing, and the point itself. */
    const opposite = points.filter((q) => q !== p && distanceMeters(p, q) / 1000 <= CANVAS_REACH_KM && apartDeg(bearingBetween(p, q), anti) <= OPPOSITE_SPREAD_DEG)
    const ag = blocked ? null : readAfterglow({ opposite: [p, ...opposite], sunLow: lows.length === 0 ? [p.low] : lows })
    const glow = ag?.score ?? 0
    const score = Math.max(sunScore, glow)
    const word: ColorWord = score >= LIKELY_FROM ? 'Likely' : score >= POSSIBLE_FROM ? 'Possible' : 'Little'
    const sunWhy = [
      blocked ? 'low deck overhead' : patch || overhead >= 0.8 ? 'patch overhead' : nearBest >= 0.8 ? `patch to the ${toward}` : upper(p) < 10 && nearBest < 0.3 ? 'clear sky' : 'thin cloud',
      gap >= 0.7 ? `gap open ${toward}` : gap >= 0.4 ? `gap partly ${toward}` : `gap shut ${toward}`,
    ]
    const why = glow > sunScore && ag !== null ? [ag.fires ? `cloud to the ${away} to catch the pink` : `Belt of Venus ${away}`, gap >= 0.7 ? `light in from the ${toward}` : `light partly in from the ${toward}`] : sunWhy
    return { lat: p.lat, lon: p.lon, sunScore, sunWhy, glow, glowFires: ag?.fires === true, belt: ag?.belt === true, canvas, overhead: Math.max(upper(p) >= CANVAS_FROM ? overhead : 0, patch ? 0.9 : 0), gap, blocked, score, word, why }
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

/*
 * WHO SEES THE PATCH (Batch BEST SKY, Section 2). Cloud overhead lights up
 * for anyone under it; the low glow on the horizon needs a view open toward
 * the sun. Water in front (the reflection) and a silhouette (a bridge, a
 * pier) are small bonuses. Distance and bearing are straight lines from you,
 * worked out here.
 */
export interface SpotIn {
  id: string
  name: string
  at: LatLon
  /** The bearing the open view faces; null when not known (then the sky overhead only). */
  facing: number | null
  openDeg: number
  water: boolean
  silhouette: string | null
  /** Where the spot came from: the starter list (undefined) or the map (Batch NOW, Section 0.4). */
  kind?: 'viewpoint' | 'pier' | 'boat ramp' | 'park'
}

export interface RankedSpot {
  spot: SpotIn
  score: number
  word: ColorWord
  /** "faces WSW over water", "edge of the patch". */
  view: string
  why: string[]
  seesSun: boolean
  /** The tie-break, worked out here (see rankSpots). */
  tie: SpotTie
}

/**
 * WHEN TWO SPOTS SCORE THE SAME (Batch BEST SKY: on 11 Nov five spots read
 * 1.00), in this order: how directly the spot faces the sun (10° steps), how
 * much of the lit patch is in its view (tenths), water in front, then the
 * straight-line distance from you.
 */
export interface SpotTie {
  /** Degrees between the way the view faces and the sun; 180 when the facing is not known. */
  aimDeg: number
  /** Of the patch's points within CANVAS_REACH_KM, the share in the open view (or overhead), 0-1; 0 when there is no patch. */
  inView: number
  water: boolean
  /** From you, km; null when there is no "you". */
  km: number | null
}

export const AIM_STEP_DEG = 10
/** A grid point this close counts as overhead, whichever way you face. */
export const OVERHEAD_KM = 3
/** A grid point counts as the patch from this canvas up. */
export const PATCH_CANVAS = 0.8

export const WATER_BONUS = 0.08
/** A spot faces the opposite sky when its view is within this of the anti-solar bearing. */
export const AWAY_HALF_DEG = 90
export const SILHOUETTE_BONUS = 0.04

const apart = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180)

/** How much of the lit patch a spot has in front of it (or overhead), 0-1. */
export function patchInView(grid: readonly ScoredPoint[], s: SpotIn): number {
  const patch = grid.filter((g) => !g.blocked && g.canvas >= PATCH_CANVAS && distanceMeters(s.at, g) / 1000 <= CANVAS_REACH_KM)
  if (patch.length === 0) return 0
  const seen = patch.filter((g) => distanceMeters(s.at, g) / 1000 <= OVERHEAD_KM || (s.facing !== null && apart(bearingBetween(s.at, g), s.facing) <= s.openDeg))
  return seen.length / patch.length
}

/** Best first: the score to the hundredth (what the page shows), then the tie-break in order. */
export function compareRanked(a: RankedSpot, b: RankedSpot): number {
  return (
    Math.round(b.score * 100) - Math.round(a.score * 100) ||
    Math.round(a.tie.aimDeg / AIM_STEP_DEG) - Math.round(b.tie.aimDeg / AIM_STEP_DEG) ||
    Math.round(b.tie.inView * 10) - Math.round(a.tie.inView * 10) ||
    Number(b.tie.water) - Number(a.tie.water) ||
    (a.tie.km ?? 0) - (b.tie.km ?? 0)
  )
}

export function rankSpots(grid: readonly ScoredPoint[], spots: readonly SpotIn[], sunAzDeg: number, from: LatLon | null = null): RankedSpot[] {
  return spots
    .flatMap((s) => {
      const g = scoreAt(grid, s.at)
      if (g === null) return []
      const seesSun = s.facing !== null && apart(s.facing, sunAzDeg) <= s.openDeg
      /* Without the view toward the sun, only the cloud overhead lights up for you. */
      const base = seesSun ? g.sunScore : g.blocked ? 0 : g.overhead * g.gap
      const bonus = base <= 0 ? 0 : (s.water && seesSun ? WATER_BONUS : 0) + (s.silhouette !== null && seesSun ? SILHOUETTE_BONUS : 0)
      /* Facing the opposite half of the sky (Batch NOW, Section 0): its pink, water in front a little more. */
      const anti = antiSolar(sunAzDeg)
      const facesAway = s.facing !== null && apart(s.facing, anti) <= AWAY_HALF_DEG
      const glow = facesAway && g.glow > 0 ? g.glow + (s.water && g.glowFires ? WATER_BONUS : 0) : 0
      const byGlow = glow > base + bonus
      const score = Math.min(1, byGlow ? glow : base + bonus)
      const word: ColorWord = score >= LIKELY_FROM ? 'Likely' : score >= POSSIBLE_FROM ? 'Possible' : 'Little'
      const view = s.facing === null ? 'facing not known' : `faces ${compassPoint(s.facing)}${s.water ? ' over water' : ''}`
      const tie: SpotTie = {
        aimDeg: s.facing === null ? 180 : apart(s.facing, sunAzDeg),
        inView: patchInView(grid, s),
        water: s.water,
        km: from === null ? null : distanceMeters(from, s.at) / 1000,
      }
      const look = compassPoint(anti)
      const why = byGlow ? [g.glowFires ? `pink on the clouds ${look}` : `Belt of Venus ${look}`, s.water ? 'over the water' : 'facing that way'] : seesSun ? g.sunWhy : [g.sunWhy[0], 'faces away from the sun']
      return [{ spot: s, score, word, view, why, seesSun, tie }]
    })
    .sort(compareRanked)
}

/** Better by at least this much than where you are, and further than this, before the home says so. */
export const BETTER_BY = 0.2
export const BETTER_FROM_KM = 1.5

/**
 * The home's row (Batch BEST SKY, Section 4) when the best spot beats where
 * you are: "Better color 6 mi NW · Rudee Inlet · 4:55". Null otherwise.
 */
export function betterColorLine(ranked: readonly RankedSpot[], here: ScoredPoint | null, from: LatLon, at: string, miles: boolean): string | null {
  const best = ranked.find((r) => r.word !== 'Little')
  if (best === undefined || here === null) return null
  if (distanceMeters(from, best.spot.at) / 1000 < BETTER_FROM_KM) return null
  if (best.score < here.score + BETTER_BY) return null
  return `Better color ${distanceWords(from, best.spot.at, miles)} · ${best.spot.name} · ${at}`
}

/** The best spot near in a few words, when it beats where you are: "Lynnhaven Inlet 6 mi NW" (the "Color now" line and the calendar). */
export function bestSpotWords(ranked: readonly RankedSpot[], here: ScoredPoint | null, from: LatLon, miles: boolean): string | null {
  const best = ranked.find((r) => r.word !== 'Little')
  if (best === undefined || here === null || distanceMeters(from, best.spot.at) / 1000 < BETTER_FROM_KM || best.score < here.score + BETTER_BY) return null
  return `${best.spot.name} ${distanceWords(from, best.spot.at, miles)}`
}

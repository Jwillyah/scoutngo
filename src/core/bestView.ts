/*
 * BEST FIRE NEAR ME (Batch J, Section 5). Where the colour will be, from the
 * lit-sky geometry, and which spots can see it.
 *
 * WHERE. A deck lit from under (src/core/underLight.ts) colours first in a
 * wedge round the sun's azimuth, low over the horizon where the light gets
 * in (WEDGE_HALF_DEG either side), then overhead, then the afterglow on the
 * deck overhead and away from the sun as the light goes. A spot sees the
 * best of it when its horizon toward the wedge is open: water, not houses
 * and trees. Overhead and the afterglow anyone sees.
 *
 * HOW OPEN, from the map's own ocean polygons (src/lib/coast.ts): along
 * bearings across the wedge, every WATER_STEP_M out to WATER_REACH_M, the
 * share of points on water. OPEN_SHARE or more is an open horizon; under
 * LAND_SHARE a land horizon, and a spot that FACES AWAY (its sea more than
 * AWAY_DEG off the wedge) sees the afterglow only. A land horizon is not
 * said to be blocked: the map has no trees, and a drone up high sees over
 * them, so "drone up high" is said with it. Never "clear".
 */
import { angleApart } from './coastFacing.ts'
import { destinationPoint, distanceMeters, bearingBetween, type LatLon } from './geo.ts'
import { compassPoint } from './field.ts'

export const WEDGE_HALF_DEG = 30
export const WEDGE_STEP_DEG = 10
export const WATER_STEP_M = 500
export const WATER_REACH_M = 4000
export const OPEN_SHARE = 0.6
export const LAND_SHARE = 0.2
export const AWAY_DEG = 100

export type Openness = 'open' | 'part' | 'land'

export interface ViewSpot {
  name: string
  at: LatLon
  /** The way its sea lies, when known. */
  facing: number | null
}

export interface RankedSpot extends ViewSpot {
  share: number
  open: Openness
  /** Its sea is more than AWAY_DEG off the wedge: afterglow only. */
  away: boolean
  km: number
}

/** The sample points across the wedge from a spot. */
export function wedgeSamples(at: LatLon, centreDeg: number): LatLon[] {
  const out: LatLon[] = []
  for (let a = -WEDGE_HALF_DEG; a <= WEDGE_HALF_DEG; a += WEDGE_STEP_DEG) {
    for (let m = WATER_STEP_M; m <= WATER_REACH_M; m += WATER_STEP_M) out.push(destinationPoint(at, (centreDeg + a + 360) % 360, m))
  }
  return out
}

/** The share of the wedge's samples on water, 0-1. */
export function waterShare(at: LatLon, centreDeg: number, sea: (p: LatLon) => boolean): number {
  const s = wedgeSamples(at, centreDeg)
  return s.filter(sea).length / s.length
}

export const openness = (share: number): Openness => (share >= OPEN_SHARE ? 'open' : share >= LAND_SHARE ? 'part' : 'land')

/** Ranked: open first by share, nearest first among equals; spots facing away last. */
export function rankSpots(venue: LatLon, centreDeg: number, spots: readonly ViewSpot[], sea: (p: LatLon) => boolean): RankedSpot[] {
  return spots
    .map((s) => {
      const share = waterShare(s.at, centreDeg, sea)
      const away = s.facing !== null && angleApart(s.facing, centreDeg) > AWAY_DEG && share < LAND_SHARE
      return { ...s, share, open: openness(share), away, km: distanceMeters(venue, s.at) / 1000 }
    })
    .sort((a, b) => Number(a.away) - Number(b.away) || b.share - a.share || a.km - b.km)
}

/**
 * The nearest shore that looks into the wedge over water: grid points every
 * SHORE_GRID_M within SHORE_REACH_M of the venue, on land, with OPEN_SHARE
 * of the wedge on water. Null when none.
 */
export const SHORE_GRID_M = 1000
export const SHORE_REACH_M = 15000
export function nearestShore(venue: LatLon, centreDeg: number, sea: (p: LatLon) => boolean): { at: LatLon; km: number; toward: string } | null {
  let best: { at: LatLon; km: number } | null = null
  const n = Math.floor(SHORE_REACH_M / SHORE_GRID_M)
  for (let i = -n; i <= n; i += 1) {
    for (let j = -n; j <= n; j += 1) {
      const d = Math.hypot(i, j) * SHORE_GRID_M
      if (d > SHORE_REACH_M) continue
      const p = destinationPoint(destinationPoint(venue, 0, j * SHORE_GRID_M), 90, i * SHORE_GRID_M)
      if (sea(p)) continue
      /* The edge of the land: water within one step toward the wedge. */
      if (!sea(destinationPoint(p, centreDeg, WATER_STEP_M)) && !sea(destinationPoint(p, centreDeg, WATER_STEP_M * 2))) continue
      if (waterShare(p, centreDeg, sea) < OPEN_SHARE) continue
      const km = d / 1000
      if (best === null || km < best.km) best = { at: p, km }
    }
  }
  return best === null ? null : { ...best, toward: compassPoint(bearingBetween(venue, best.at)) }
}

export interface BestView {
  /** "WSW". */
  toward: string
  centreDeg: number
  ranked: RankedSpot[]
  shore: { at: LatLon; km: number; toward: string } | null
  /** "Best view tonight: open WSW horizon · Chix, Lynnhaven, drone up high. Oceanfront faces away: afterglow only." */
  line: string
}

const short = (name: string) => name.split(/[,(]/)[0].trim()

export function bestView(venue: LatLon, sunAzimuthDeg: number, spots: readonly ViewSpot[], sea: (p: LatLon) => boolean): BestView {
  const toward = compassPoint(sunAzimuthDeg)
  const ranked = rankSpots(venue, sunAzimuthDeg, spots, sea)
  const shore = nearestShore(venue, sunAzimuthDeg, sea)
  const names = (o: Openness) => [...new Set(ranked.filter((s) => s.open === o && !s.away).map((s) => short(s.name)))].slice(0, 2)
  const open = names('open')
  const part = names('part')
  const away = [...new Set(ranked.filter((s) => s.away).map((s) => short(s.name)))].slice(0, 1)
  const head =
    open.length > 0
      ? `Best view tonight: open ${toward} horizon · ${open.join(', ')}, drone up high`
      : part.length > 0
        ? `Best view tonight: ${toward} horizon partly over water · ${part.join(', ')}, drone up high`
        : shore !== null
          ? `Best view tonight: open ${toward} horizon · a shore ${Math.round(shore.km)} km ${shore.toward}, drone up high`
          : `Best view tonight: toward the ${toward} · no water horizon near; drone up high`
  const line = `${head}.${away.length === 0 ? '' : ` ${away[0]} faces away: afterglow only.`}`
  return { toward, centreDeg: sunAzimuthDeg, ranked, shore, line }
}

/** The wedge and the ranked spots, for the map's guide layer. */
export function bestViewOnMap(venue: LatLon, v: BestView, reachKm = 20): GeoJSON.FeatureCollection {
  const arc: [number, number][] = []
  for (let a = -WEDGE_HALF_DEG; a <= WEDGE_HALF_DEG; a += 3) {
    const p = destinationPoint(venue, (v.centreDeg + a + 360) % 360, reachKm * 1000)
    arc.push([p.lon, p.lat])
  }
  const o: [number, number] = [venue.lon, venue.lat]
  const spots = v.ranked.filter((s) => !s.away).slice(0, 5)
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { kind: 'wedge' }, geometry: { type: 'LineString', coordinates: [o, ...arc, o] } },
      ...spots.map((s, i) => ({ type: 'Feature' as const, properties: { kind: 'spot', rank: i + 1, name: s.name }, geometry: { type: 'Point' as const, coordinates: [s.at.lon, s.at.lat] } })),
      ...(v.shore === null ? [] : [{ type: 'Feature' as const, properties: { kind: 'spot', rank: spots.length + 1, name: 'shore' }, geometry: { type: 'Point' as const, coordinates: [v.shore.at.lon, v.shore.at.lat] } }]),
    ],
  }
}

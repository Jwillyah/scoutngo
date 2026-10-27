/**
 * Real land and water geometry from OpenStreetMap, via Overpass.
 *
 * docs/brief.md roadmap item 2: feed the model actual shapes rather than making
 * it read land from pixels, and check the positions it returns against those
 * shapes afterwards.
 *
 * Overpass is a free, shared, volunteer-run service. So: one request per
 * generate, never on pan or zoom, results cached per bounding box, a hard
 * timeout, a minimum gap between calls, and a clean fall back to working without
 * it if it is slow or down. Being unavailable must cost the user nothing except
 * the validation.
 */

import type { Position } from '../core/geo.ts'
import type { Landcover, Ring, RoadLine } from '../core/siting.ts'
import type { SiteMark } from '../core/siteMark.ts'
import type { MapBounds } from './generation.ts'

import { askOverpass, OVERPASS_SERVERS } from './overpassClient.ts'

/** The first of the servers the app asks (overpassClient.ts has all three, and the order). */
export const OVERPASS_URL = OVERPASS_SERVERS[0]
/** Their own guidance is to keep it modest. One call per generate, minimum gap. */
export const MIN_INTERVAL_MS = 5000
export const TIMEOUT_MS = 12000

/** Half carriageway by road class, metres. Deliberately conservative. */
const ROAD_HALF_WIDTH: Record<string, number> = {
  motorway: 12,
  trunk: 10,
  primary: 8,
  secondary: 7,
  tertiary: 6,
  residential: 5,
  unclassified: 5,
  service: 3,
  living_street: 4,
}
const DEFAULT_ROAD_HALF_WIDTH = 4
/** Paths are where a shooter stands, not something to warn about. */
const NOT_A_ROADWAY = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'])

export function buildQuery(bounds: MapBounds): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
  return `[out:json][timeout:20];
(
  way["natural"="water"](${bbox});
  way["natural"="coastline"](${bbox});
  way["waterway"](${bbox});
  relation["natural"="water"](${bbox});
  relation["waterway"="riverbank"](${bbox});
  way["building"](${bbox});
  way["man_made"="pier"](${bbox});
  way["highway"](${bbox});
  way["amenity"="parking"](${bbox});
  way["power"="line"](${bbox});
  way["power"="minor_line"](${bbox});
  node["power"="tower"](${bbox});
  node["power"="pole"](${bbox});
);
out geom;`
}

/** Cache key. Rounded so a nudge of the map is still a hit. */
export function boundsKey(bounds: MapBounds): string {
  const r = (n: number) => n.toFixed(4)
  return `${r(bounds.west)},${r(bounds.south)},${r(bounds.east)},${r(bounds.north)}`
}

export interface OverpassElement {
  type?: unknown
  id?: unknown
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
  /** A node has a coordinate rather than a geometry. Poles and towers are nodes. */
  lat?: unknown
  lon?: unknown
  /** A relation's members, each way with its own geometry under `out geom`. */
  members?: { type?: unknown; role?: unknown; geometry?: { lat: number; lon: number }[] }[]
}

/*
 * RIVERS ARE OFTEN RELATIONS, NOT WAYS. The Wicomico at Brew River is three
 * multipolygon relations, and this parser read water WAYS only, so Suggest
 * could stand a tripod in it and the water check said nothing. A relation's
 * outline is its member ways joined end to end; this joins them into closed
 * rings. A chain that never closes is dropped rather than closed by guesswork.
 */
export function stitchRings(lines: readonly Position[][]): Position[][] {
  const key = (p: Position) => `${p[0]},${p[1]}`
  const pool = lines.filter((l) => l.length >= 2).map((l) => [...l])
  const rings: Position[][] = []
  while (pool.length > 0) {
    let ring = pool.shift() ?? []
    for (let guard = 0; guard < 10_000 && key(ring[0]) !== key(ring[ring.length - 1]); guard += 1) {
      const end = key(ring[ring.length - 1])
      const i = pool.findIndex((l) => key(l[0]) === end || key(l[l.length - 1]) === end)
      if (i === -1) break
      const next = pool.splice(i, 1)[0]
      ring = ring.concat(key(next[0]) === end ? next.slice(1) : [...next].reverse().slice(1))
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring)
  }
  return rings
}

function relationWater(raw: OverpassElement): Ring[][] {
  const ways = (role: string) =>
    (raw.members ?? [])
      .filter((m) => m.type === 'way' && m.role === role && Array.isArray(m.geometry))
      .map((m) => (m.geometry ?? []).map((g) => [round6(g.lon), round6(g.lat)] as Position))
  const inners = stitchRings(ways('inner'))
  return stitchRings(ways('outer')).map((outer) => [outer, ...inners])
}

export interface SiteGeometry {
  land: Landcover
  /** Compact shapes for the model, already trimmed for token budget. */
  summary: SiteSummary
  /**
   * WHAT OSM HAS MAPPED OF THE POWER NETWORK, as site marks.
   *
   * SEPARATE FROM `land`, which is about where a position may STAND. These are
   * about what is in the air above it, which is a different question with a
   * different answer and a different reliability.
   *
   * THE RELIABILITY IS THE POINT. Transmission lines are mapped well in OSM
   * because they are large and visible from imagery. Local distribution, the
   * wires on wooden poles down the side of a car park, is patchy to absent.
   * So these arrive labelled with their source and nothing anywhere treats an
   * empty list as an answer about the site. See src/core/siteMark.ts.
   *
   * NO HEIGHTS. OSM rarely carries one for a line, and a default height here
   * would put an invented number into the sightline geometry. They come
   * through with heightMeters null, are drawn, and take no part in the
   * sightline check until the shooter gives one.
   */
  power: SiteMark[]
}

export interface SiteSummary {
  water: Position[][]
  buildings: Position[][]
  piers: Position[][]
  roads: Position[][]
  parking: Position[][]
}

const EMPTY_SUMMARY: SiteSummary = {
  water: [],
  buildings: [],
  piers: [],
  roads: [],
  parking: [],
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

function toRing(element: OverpassElement): Position[] | null {
  if (!Array.isArray(element.geometry) || element.geometry.length < 2) return null
  return element.geometry.map((p) => [round6(p.lon), round6(p.lat)] as Position)
}

const isClosed = (ring: Position[]) =>
  ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]

/** Drops points from a long way so the model is not handed thousands of them. */
export function simplify(ring: Position[], maxPoints: number): Position[] {
  if (ring.length <= maxPoints) return ring
  const step = Math.ceil(ring.length / maxPoints)
  const out = ring.filter((_, index) => index % step === 0)
  const last = ring[ring.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

export function parseOverpass(payload: unknown): SiteGeometry {
  const elements = (payload as { elements?: unknown })?.elements
  if (!Array.isArray(elements)) {
    return {
      land: { water: [], roads: [], structures: [], coastline: [] },
      summary: EMPTY_SUMMARY,
      power: [],
    }
  }

  const water: Ring[][] = []
  const roads: RoadLine[] = []
  const structures: Ring[][] = []
  /* The sea: open ways with the water on their right. See isInSea in core/siting.ts. */
  const coastline: Position[][] = []
  const summary: SiteSummary = { water: [], buildings: [], piers: [], roads: [], parking: [] }
  const power: SiteMark[] = []

  for (const raw of elements as OverpassElement[]) {
    const tags = raw.tags ?? {}

    if (raw.type === 'relation') {
      if (tags.natural === 'water' || tags.waterway === 'riverbank') {
        for (const shape of relationWater(raw)) {
          water.push(shape)
          summary.water.push(simplify(shape[0], 24))
        }
      }
      continue
    }

    /*
     * POWER FIRST, because a pole is a NODE with a lat and lon rather than a
     * way with a geometry, so it has to be read before toRing rejects it.
     */
    const powerTag = tags.power
    if (powerTag === 'line' || powerTag === 'minor_line') {
      const path = (raw.geometry ?? []).map((p) => ({ lat: round6(p.lat), lon: round6(p.lon) }))
      if (path.length >= 2) {
        power.push(osmMark(`osm-${String(raw.id)}`, { kind: 'line', path }, tags))
      }
      continue
    }
    if (powerTag === 'tower' || powerTag === 'pole') {
      if (typeof raw.lat === 'number' && typeof raw.lon === 'number') {
        power.push(
          osmMark(
            `osm-${String(raw.id)}`,
            { kind: 'point', at: { lat: round6(raw.lat), lon: round6(raw.lon) } },
            tags,
          ),
        )
      }
      continue
    }

    const ring = toRing(raw)
    if (ring === null) continue

    const highway = tags.highway
    if (typeof highway === 'string') {
      if (!NOT_A_ROADWAY.has(highway)) {
        roads.push({
          positions: ring,
          halfWidthMeters: ROAD_HALF_WIDTH[highway] ?? DEFAULT_ROAD_HALF_WIDTH,
        })
        summary.roads.push(simplify(ring, 12))
      }
      continue
    }

    if (tags.natural === 'coastline') {
      coastline.push(ring)
      continue
    }

    if (tags.natural === 'water' || typeof tags.waterway === 'string') {
      // Only a closed way bounds an area. A river centreline does not.
      if (isClosed(ring)) {
        water.push([ring])
        summary.water.push(simplify(ring, 24))
      } else {
        summary.water.push(simplify(ring, 24))
      }
      continue
    }

    if (tags.man_made === 'pier') {
      summary.piers.push(simplify(ring, 12))
      // People stand on piers, so a drone path over one is worth flagging.
      if (isClosed(ring)) structures.push([ring])
      continue
    }
    if (tags.amenity === 'parking') {
      summary.parking.push(simplify(ring, 12))
      if (isClosed(ring)) structures.push([ring])
      continue
    }
    if (typeof tags.building === 'string') {
      summary.buildings.push(simplify(ring, 8))
      if (isClosed(ring)) structures.push([ring])
      continue
    }
  }

  return { land: { water, roads, structures, coastline }, summary, power }
}

/**
 * One OSM power feature as a site mark.
 *
 * CONFIRMED, because OpenStreetMap is a record of something somebody surveyed,
 * not a guess. It is still labelled 'osm' everywhere it is drawn, because
 * "somebody mapped this" and "I stood here and saw it" are different claims and
 * the shooter is entitled to know which they are looking at.
 *
 * NO HEIGHT unless OSM carries one, which it almost never does for a line.
 */
function osmMark(id: string, shape: SiteMark['shape'], tags: Record<string, string>): SiteMark {
  const tagged = Number(tags['height'] ?? tags['tower:height'] ?? '')
  return {
    id,
    kind: 'power-line',
    shape,
    heightMeters: Number.isFinite(tagged) && tagged > 0 ? tagged : null,
    foliage: 'solid',
    source: 'osm',
    confirmed: true,
    note: tags.power === 'tower' ? 'Tower' : tags.power === 'pole' ? 'Pole' : 'Line',
  }
}

/** Caps what goes into the prompt so a dense city cannot blow the token budget. */
export function trimSummary(summary: SiteSummary): SiteSummary {
  return {
    water: summary.water.slice(0, 40),
    buildings: summary.buildings.slice(0, 60),
    piers: summary.piers.slice(0, 20),
    roads: summary.roads.slice(0, 60),
    parking: summary.parking.slice(0, 20),
  }
}

const cache = new Map<string, SiteGeometry>()
let lastCallAt = 0

export function clearOverpassCache(): void {
  cache.clear()
  lastCallAt = 0
}

export type SiteGeometryResult =
  | { status: 'ok'; geometry: SiteGeometry; cached: boolean }
  | { status: 'unavailable'; reason: string }

/**
 * Never throws and never blocks a generate. If Overpass is slow, rate limited,
 * or down, the caller carries on exactly as it did before this existed.
 */
export async function fetchSiteGeometry(bounds: MapBounds): Promise<SiteGeometryResult> {
  const key = boundsKey(bounds)
  const hit = cache.get(key)
  if (hit !== undefined) return { status: 'ok', geometry: hit, cached: true }

  const since = Date.now() - lastCallAt
  if (lastCallAt !== 0 && since < MIN_INTERVAL_MS) {
    return { status: 'unavailable', reason: 'Overpass was queried moments ago; skipping.' }
  }

  lastCallAt = Date.now()
  const answer = await askOverpass(buildQuery(bounds), { budgetMs: TIMEOUT_MS })
  if (!answer.ok) return { status: 'unavailable', reason: answer.reason }
  const geometry = parseOverpass(answer.payload)
  cache.set(key, geometry)
  return { status: 'ok', geometry, cached: false }
}

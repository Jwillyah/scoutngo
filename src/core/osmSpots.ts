/*
 * MORE SPOTS FROM THE MAP (Batch NOW, Section 0.4): OpenStreetMap's
 * viewpoints, piers, boat ramps and the parks on the water, inside the
 * radius, beside the starter list. Asked by fixed 0.25° tiles (the tile's
 * square, never the spot), each kept a week. Arithmetic and words here: the
 * query for a tile, the answer read into spots with a facing where the map
 * gives one (a viewpoint's direction tag) and otherwise none, then only the
 * sky overhead counts for it. Not a pier's line: the map does not say which
 * end is the shore, and a pier drawn as an area has none (13 Nov: Little
 * Island Fishing Pier, which runs east into the ocean, read "faces N").
 */
import type { SpotIn } from './bestSky.ts'
import type { LatLon } from './geo.ts'

export const OSM_TILE_DEG = 0.25
/** A park counts as on the water within this many metres of a beach or a water way (the coastline's long ways and big water relations, Back Bay's, time Overpass out). */
export const PARK_WATER_M = 150
/** The view's half width for a map spot whose facing is known. */
export const OSM_OPEN_DEG = 60

export interface OsmTile {
  south: number
  west: number
}

/** The fixed tiles under a circle: their south-west corners on the 0.25° grid. */
export function osmTiles(centre: LatLon, radiusKm: number): OsmTile[] {
  const dLat = radiusKm / 111.32
  const dLon = radiusKm / (111.32 * Math.cos((centre.lat * Math.PI) / 180))
  const out: OsmTile[] = []
  for (let s = Math.floor((centre.lat - dLat) / OSM_TILE_DEG) * OSM_TILE_DEG; s < centre.lat + dLat; s += OSM_TILE_DEG) {
    for (let w = Math.floor((centre.lon - dLon) / OSM_TILE_DEG) * OSM_TILE_DEG; w < centre.lon + dLon; w += OSM_TILE_DEG) out.push({ south: Number(s.toFixed(2)), west: Number(w.toFixed(2)) })
  }
  return out
}

/** The tile's Overpass question: its bounding box only. */
export function osmQuery(t: OsmTile): string {
  const bbox = `${t.south},${t.west},${(t.south + OSM_TILE_DEG).toFixed(2)},${(t.west + OSM_TILE_DEG).toFixed(2)}`
  /* Named piers only, and boat ramps not marked private: round Hampton Roads the map has hundreds of private docks tagged as piers (13 Nov: 341 in one tile, past the answer's 400 cap). */
  return `[out:json][timeout:25];(node["tourism"="viewpoint"](${bbox});way["man_made"="pier"]["name"](${bbox});nwr["leisure"="slipway"]["access"!~"^(private|no)$"](${bbox});)->.a;(way["natural"="beach"](${bbox});way["natural"="water"](${bbox});)->.w;nwr["leisure"="park"]["name"](around.w:${PARK_WATER_M})->.p;(.a;.p;);out tags geom 400;`
}

const DIRS: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 }

interface El {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  geometry?: { lat: number; lon: number }[]
  tags?: Record<string, string>
}

/** A viewpoint's "direction" tag as a bearing: "270", "W", "200-280". Null when not said. */
export function directionOf(tag: string | undefined): number | null {
  if (tag === undefined) return null
  const t = tag.trim().toUpperCase()
  if (t in DIRS) return DIRS[t]
  const range = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(t)
  if (range !== null) {
    const a = Number(range[1])
    const b = Number(range[2])
    const span = (((b - a) % 360) + 360) % 360
    return (a + span / 2) % 360
  }
  const n = Number(t)
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : null
}

/** The answer read into spots; the kind in the name when it has none ("Pier", "Boat ramp"). */
export function osmSpots(payload: unknown): SpotIn[] {
  const els = ((payload as { elements?: El[] } | null)?.elements ?? []) as El[]
  const out: SpotIn[] = []
  for (const e of els) {
    const g = e.geometry ?? []
    const at = e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : e.center ?? (g.length === 0 ? null : { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.lon, 0) / g.length })
    if (at === null) continue
    const tags = e.tags ?? {}
    const kind = tags.tourism === 'viewpoint' ? 'Viewpoint' : tags.man_made === 'pier' ? 'Pier' : tags.leisure === 'slipway' ? 'Boat ramp' : tags.leisure === 'park' ? 'Park' : null
    if (kind === null) continue
    const facing = kind === 'Viewpoint' ? directionOf(tags.direction) : null
    out.push({
      kind: kind === 'Viewpoint' ? 'viewpoint' : kind === 'Pier' ? 'pier' : kind === 'Boat ramp' ? 'boat ramp' : 'park',
      id: `osm-${e.type}-${e.id}`,
      name: tags.name ?? kind,
      at,
      facing,
      openDeg: facing === null ? 0 : OSM_OPEN_DEG,
      water: kind !== 'Viewpoint',
      silhouette: kind === 'Pier' ? 'pier' : null,
    })
  }
  return out
}

/** Map spots that are not within `nearM` of a starter spot or each other (the same place twice). */
export function dedupeSpots(starter: readonly SpotIn[], extra: readonly SpotIn[], nearM = 300, distance: (a: LatLon, b: LatLon) => number): SpotIn[] {
  const kept: SpotIn[] = []
  for (const s of extra) {
    if (starter.some((t) => distance(t.at, s.at) < nearM) || kept.some((t) => distance(t.at, s.at) < nearM)) continue
    kept.push(s)
  }
  return kept
}

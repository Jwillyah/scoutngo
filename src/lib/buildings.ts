/*
 * OSM BUILDING FOOTPRINTS, WITH THEIR HEIGHTS.
 *
 * FROM THE MAP TILES NOW (fetchBuildings, below, and src/lib/vectorTiles.ts).
 * The Overpass query and its parser stay for the measuring scripts that
 * read past results with them.
 *
 * WHY A SEPARATE QUERY FROM fetchSiteGeometry, which already asks for
 * buildings. That one asks over the map viewport for the SITING decision and
 * trims the rings hard for the model's token budget: simplify() drops points
 * and the heights are thrown away because the model never needed them. This
 * needs the opposite: full rings for an extrusion and the height tags kept,
 * because the heights are the reason to have it.
 *
 * THE HEIGHTS ARE STORED, NOT JUST RENDERED. Each footprint keeps its parsed
 * height and the SOURCE of it, so the shadow casting and the sightline check
 * can read the same numbers the boxes were drawn from rather than asking
 * Overpass again. See src/core/buildingHeight.ts.
 *
 * WHAT GOES TO OVERPASS: a bounding box. The same trade the site geometry and
 * the forecast already make. Nothing is stored and there is no key.
 */

import { readSavedBuildings, saveBuildings } from './savedBuildings.ts'
import {
  parseBuildingHeight,
  type BuildingHeight,
  type BuildingTags,
} from '../core/buildingHeight.ts'
import type { MapBounds } from './generation.ts'
import type { OverpassElement } from './overpass.ts'
import { buildingsFromTiles } from './vectorTiles.ts'

export interface Building {
  id: string
  /** Closed ring, [lon, lat] pairs, as OSM gave it. */
  ring: [number, number][]
  height: BuildingHeight
  name: string | null
}

export function buildBuildingsQuery(bounds: MapBounds): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
  /*
   * `way` and `relation`, because a building with a courtyard is a multipolygon
   * relation and skipping those leaves holes in city centres. `out geom` gives
   * the coordinates inline so no second lookup is needed.
   */
  return `[out:json][timeout:25];
(
  way["building"](${bbox});
  relation["building"](${bbox});
);
out geom tags;`
}

/** Tolerant of anything. A bad payload is no buildings, never a throw. */
export function parseBuildings(payload: unknown): Building[] {
  if (typeof payload !== 'object' || payload === null) return []
  const elements = (payload as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return []

  const out: Building[] = []
  for (const raw of elements as (OverpassElement & {
    members?: { geometry?: { lat: number; lon: number }[]; role?: string }[]
  })[]) {
    const tags = (raw.tags ?? {}) as BuildingTags & { name?: string; building?: string }
    if (typeof tags.building !== 'string' || tags.building === 'no') continue

    /*
     * A way carries its own geometry; a relation carries it on its outer
     * members. Only the outer ring is taken: a courtyard drawn as a solid
     * block is wrong, but an inner ring extruded as its own box is worse, and
     * fill-extrusion has no hole support to do it properly.
     */
    const rings: { lat: number; lon: number }[][] = []
    if (Array.isArray(raw.geometry)) rings.push(raw.geometry)
    for (const member of raw.members ?? []) {
      if (member.role === 'outer' && Array.isArray(member.geometry)) rings.push(member.geometry)
    }

    for (const [index, geometry] of rings.entries()) {
      if (geometry.length < 4) continue
      const ring = geometry
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => [p.lon, p.lat] as [number, number])
      if (ring.length < 4) continue
      /* Close it if OSM did not: a fill-extrusion ring must be closed. */
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])

      out.push({
        id: `${String(raw.id ?? 'b')}-${index}`,
        ring,
        height: parseBuildingHeight(tags),
        name: typeof tags.name === 'string' && tags.name.trim() !== '' ? tags.name.trim() : null,
      })
    }
  }
  return out
}

/** GeoJSON for the extrusion layer, carrying the height it was drawn at. */
export function buildingsToGeoJson(buildings: readonly Building[]): {
  type: 'FeatureCollection'
  features: unknown[]
} {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      id: b.id,
      geometry: { type: 'Polygon', coordinates: [b.ring] },
      properties: {
        /* What the box is drawn at. Never null, never geometric truth. */
        drawMetres: b.height.drawMetres,
        baseMetres: b.height.baseMetres,
        /*
         * WHETHER THE HEIGHT IS SURVEYED, carried into the paint so an
         * unmapped height can be drawn differently from a known one. A city
         * block of identical nominal boxes claiming to be surveyed is the
         * thing this avoids.
         */
        measured: b.height.metres !== null,
        source: b.height.source,
      },
    })),
  }
}

export type BuildingsResult =
  /** `savedAt` when the list came from the phone because the map tiles could not be had. */
  | { status: 'ok'; buildings: Building[]; cached: boolean; savedAt?: string }
  | { status: 'unavailable'; reason: string }

const cache = new Map<string, Building[]>()

export function clearBuildingsCache(): void {
  cache.clear()
}

const key = (b: MapBounds) =>
  [b.west, b.south, b.east, b.north].map((n) => n.toFixed(3)).join(',')

/** The copy kept on the phone for these bounds, with when it was fetched, or null. */
export function savedBuildingsFor(bounds: MapBounds): { buildings: Building[]; fetchedAt: string } | null {
  return readSavedBuildings(key(bounds))
}

/**
 * THE BUILDINGS OVER SOME BOUNDS, FROM THE MAP TILES (src/lib/vectorTiles.ts):
 * OpenFreeMap's footprints with their heights, for the 2D map, the 3D view
 * and the run suggestion alike. No longer Overpass, which at Virginia Beach
 * on 27 Oct answered a Mac and not an iPhone behind Private Relay.
 *
 * The tiles come from the phone's saved copy or the network under the tile
 * timeout. When they cannot be had, the list kept from last time, said with
 * its age. Never throws.
 */
export async function fetchBuildings(bounds: MapBounds): Promise<BuildingsResult> {
  /*
   * WITH THE SCAN'S HEIGHTS, when a 3D scan of this patch is kept on the phone
   * (src/lib/lidar/useScan.ts): the one place every user of buildings asks,
   * so the 3D view, the 2D shadows, the sightlines and Suggest agree.
   */
  const centre = { lat: (bounds.south + bounds.north) / 2, lon: (bounds.west + bounds.east) / 2 }
  const scanned = async (list: Building[]) => (await import('./lidar/useScan.ts')).withScan(list, centre)
  const cacheKey = key(bounds)
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return { status: 'ok', buildings: await scanned(hit), cached: true }

  const answer = await buildingsFromTiles(bounds)
  if (answer.status === 'ok') {
    cache.set(cacheKey, answer.buildings)
    saveBuildings(cacheKey, answer.buildings)
    return { status: 'ok', buildings: await scanned(answer.buildings), cached: false }
  }
  /* No signal and not saved: the list kept on the phone, said with its age. */
  const saved = readSavedBuildings(cacheKey)
  if (saved !== null) return { status: 'ok', buildings: await scanned(saved.buildings), cached: true, savedAt: saved.fetchedAt }
  return { status: 'unavailable', reason: answer.reason }
}

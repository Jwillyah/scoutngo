/*
 * THE TILE SOURCES THE OFFLINE CACHE STORES, AND THE ZOOMS IT STORES THEM AT.
 *
 * One place, read by the map, by the cache and by the measuring script, so the
 * three cannot drift apart. A cache keyed on a URL the map no longer asks for
 * is a cache that is never hit, and nothing on screen would say so.
 */

/** Esri World Imagery. {z}/{y}/{x}: row before column, Esri's ordering. */
export const IMAGERY_TEMPLATE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/** AWS terrarium elevation. {z}/{x}/{y}: standard XYZ. */
export const TERRAIN_TEMPLATE =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

/** Inclusive. The brief: z14 to z18. */
export const IMAGERY_ZOOMS: readonly [number, number] = [14, 18]

/** Inclusive. The terrarium source stops at 15 and MapLibre overzooms past it. */
export const TERRAIN_ZOOMS: readonly [number, number] = [14, 15]

/*
 * OpenFreeMap vector tiles, OpenMapTiles schema: building footprints with
 * their heights, and the sea as polygons. No key, no cookies. `latest`, not
 * the dated build the TileJSON names, so a saved tile is still found after
 * OpenFreeMap's weekly rebuild; it serves the same bytes (checked on 27 Oct
 * against planet/20261018_080001_pt).
 */
export const VECTOR_TEMPLATE = 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf'

/** Inclusive. Buildings are in 13 and 14 only; 14 is the deepest there is. Below 12 the elevation is not cleaned against the sea. */
export const VECTOR_ZOOMS: readonly [number, number] = [12, 14]

/**
 * The vector zooms an area's elevation is cleaned against, and its buildings
 * read from: each elevation zoom reads its own, or the deepest there is
 * (vectorTileFor in src/lib/vectorTiles.ts). Null when no elevation zoom of
 * the area reaches VECTOR_ZOOMS.
 */
export function vectorZoomsFor(terrainZooms: readonly [number, number]): [number, number] | null {
  if (terrainZooms[1] < VECTOR_ZOOMS[0]) return null
  const hi = Math.min(terrainZooms[1], VECTOR_ZOOMS[1])
  return [Math.min(Math.max(terrainZooms[0], VECTOR_ZOOMS[0]), hi), hi]
}

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

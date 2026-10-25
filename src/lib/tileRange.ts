/*
 * WHICH MAP TILES COVER A VENUE.
 *
 * WHY THIS EXISTS. ScoutNGo was unusable in Shenandoah with no service: the
 * geometry worked, the picture under it did not. Taking a venue offline means
 * fetching every imagery and terrain tile that covers it, and that list is
 * arithmetic, so it is computed here and never estimated.
 *
 * NOT IN src/core. The offline brief froze src/core, and this is about which
 * files to fetch, not about where the sun is. It is still pure and tested.
 *
 * Standard slippy-map numbering, Web Mercator, x east from the antimeridian
 * and y south from the top. The Esri template takes {z}/{y}/{x} and terrarium
 * takes {z}/{x}/{y}; both are filled from these same numbers by tileUrl.
 */

import { destinationPoint, type LatLon } from '../core/geo.ts'

export interface TileId {
  z: number
  x: number
  y: number
}

export interface Box {
  south: number
  west: number
  north: number
  east: number
}

/** The column and row of the tile holding a point at zoom z. */
export function tileAt(at: LatLon, z: number): { x: number; y: number } {
  const n = 2 ** z
  const lat = (Math.max(-85.051129, Math.min(85.051129, at.lat)) * Math.PI) / 180
  const x = Math.floor(((at.lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n)
  /* A point exactly on the east or south edge belongs to the last tile. */
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) }
}

/**
 * The box that holds a circle of this radius around the venue.
 *
 * Walked out along the four compass bearings with the same geodesic the rest
 * of the app uses, so the box is the ring the shooter dragged and not a
 * degree-sized guess at it.
 */
export function boxAround(centre: LatLon, radiusMeters: number): Box {
  return {
    north: destinationPoint(centre, 0, radiusMeters).lat,
    east: destinationPoint(centre, 90, radiusMeters).lon,
    south: destinationPoint(centre, 180, radiusMeters).lat,
    west: destinationPoint(centre, 270, radiusMeters).lon,
  }
}

/** Every tile at zoom z that touches the box. */
export function tilesInBox(box: Box, z: number): TileId[] {
  const nw = tileAt({ lat: box.north, lon: box.west }, z)
  const se = tileAt({ lat: box.south, lon: box.east }, z)
  const out: TileId[] = []
  for (let x = nw.x; x <= se.x; x += 1) {
    for (let y = nw.y; y <= se.y; y += 1) out.push({ z, x, y })
  }
  return out
}

/** Every tile from minZoom to maxZoom inclusive. */
export function tilesForRange(box: Box, minZoom: number, maxZoom: number): TileId[] {
  const out: TileId[] = []
  for (let z = minZoom; z <= maxZoom; z += 1) out.push(...tilesInBox(box, z))
  return out
}

/** Fills a {z}/{x}/{y} template, whatever order the template puts them in. */
export function tileUrl(template: string, tile: TileId): string {
  return template
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y))
}

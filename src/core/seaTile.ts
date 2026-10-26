/*
 * THE SEA IS AT SEA LEVEL: an elevation tile, cleaned against the coastline.
 *
 * WHY. Terrarium's tiles off the Virginia Beach oceanfront carry bumps
 * sitting on the water: 24.60 m on the fishing pier 84 m out, and steps of
 * 52.99 m along the shoreline (measurements/2026-10-26-terrain-virginia-beach.md,
 * the raw column). Its zoom 13 and 14
 * tiles carry the sea bed where zoom 15 carries 0. Draped with the sea's
 * photograph, the bumps stood up as cliffs and the levels disagreed at every
 * tile edge, which is the stair-stepping. Nothing in the elevation says where
 * the water is. OpenStreetMap's coastline does: every coastline way has the
 * land on its left and the sea on its right (isInSea, core/siting.ts).
 *
 * So every pixel the coastline puts in the sea is written as 0 m, and the
 * shore band no higher than the land behind it (below), in the tile's own
 * Terrarium packing, before anything decodes it: the 2D map and
 * the 3D model read the same corrected numbers. Only pixels inside the box
 * the coastline was fetched for are touched; outside it the tile is as it
 * came, because a coastline that was not fetched cannot say anything.
 */
import { destinationPoint, type Position } from './geo.ts'
import { nearestCoast, SEA_SEARCH_METERS } from './siting.ts'

export interface SeaBox {
  south: number
  west: number
  north: number
  east: number
}

export interface TileAddress {
  x: number
  y: number
  z: number
}

/** The longitude and latitude of a point inside a Web Mercator tile, u and v from 0 to 1. */
export function tilePointLonLat(tile: TileAddress, u: number, v: number): { lon: number; lat: number } {
  const n = 2 ** tile.z
  const lon = ((tile.x + u) / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + v)) / n))) * 180) / Math.PI
  return { lon, lat }
}

/** The tile's corners as a box, for "does this tile touch the coastline's box at all". */
export function tileBox(tile: TileAddress): SeaBox {
  const nw = tilePointLonLat(tile, 0, 0)
  const se = tilePointLonLat(tile, 1, 1)
  return { north: nw.lat, west: nw.lon, south: se.lat, east: se.lon }
}

const overlaps = (a: SeaBox, b: SeaBox) => a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south
const inside = (p: { lat: number; lon: number }, b: SeaBox) => p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east

/** Terrarium for 0 m: 128 * 256 + 0 + 0 / 256 - 32768. */
export const SEA_LEVEL_RGB = [128, 0, 0] as const

/*
 * THE SHORE BAND. The bumps off Virginia Beach spill a few metres over the
 * coastline OpenStreetMap draws, so on the waterline itself the raw tile read
 * 10 to 38 m while 15 m up the beach it read 2. Within SHORE_BAND_M of the
 * coastline, on the land side, the ground may be no higher than the ground
 * SHORE_BAND_M inland plus SHORE_MARGIN_M. A real cliff keeps its height,
 * because the land behind a cliff is high too; an artefact standing on the
 * waterline with flat sand behind it comes down to the sand.
 */
export const SHORE_BAND_M = 20
export const SHORE_MARGIN_M = 1

const decode = (rgba: ArrayLike<number>, i: number) => rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768

function encode(rgba: Uint8ClampedArray | Uint8Array, i: number, metres: number): void {
  const v = Math.max(0, Math.min(65535.996, metres + 32768))
  rgba[i * 4] = Math.floor(v / 256)
  rgba[i * 4 + 1] = Math.floor(v) % 256
  rgba[i * 4 + 2] = Math.floor((v % 1) * 256)
  rgba[i * 4 + 3] = 255
}

/** The pixel a point falls in, inside this tile, or null outside it. */
function pixelOf(tile: TileAddress, size: number, p: { lat: number; lon: number }): number | null {
  const n = 2 ** tile.z
  const u = ((p.lon + 180) / 360) * n - tile.x
  const lat = (p.lat * Math.PI) / 180
  const v = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n - tile.y
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null
  return Math.floor(v * size) * size + Math.floor(u * size)
}

/**
 * Cleans an RGBA Terrarium tile in place against the coastline: the sea at
 * 0 m, the shore band no higher than the land behind it. Only pixels inside
 * `box` are touched. Decided every `step` pixels (at zoom 15 two pixels are
 * about 8 m, finer than the coastline is drawn) and applied per pixel.
 * Returns how many pixels changed.
 */
export function cleanTerrainRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  size: number,
  tile: TileAddress,
  coastlines: readonly Position[][],
  box: SeaBox,
  step = 2,
): number {
  if (coastlines.length === 0 || !overlaps(tileBox(tile), box)) return 0
  const original = Float64Array.from({ length: size * size }, (_, i) => decode(rgba, i))
  let changed = 0
  for (let py = 0; py < size; py += step) {
    for (let px = 0; px < size; px += step) {
      const p = tilePointLonLat(tile, (px + step / 2) / size, (py + step / 2) / size)
      if (!inside(p, box)) continue
      const near = nearestCoast(p, coastlines)
      if (near === null || near.distance > SEA_SEARCH_METERS) continue
      let cap: number | null = null
      if (near.sea) cap = 0
      else if (near.distance < SHORE_BAND_M) {
        const behind = pixelOf(tile, size, destinationPoint(p, near.inland, SHORE_BAND_M - near.distance))
        if (behind !== null) cap = Math.max(0, original[behind]) + SHORE_MARGIN_M
      }
      if (cap === null) continue
      for (let dy = 0; dy < step && py + dy < size; dy += 1) {
        for (let dx = 0; dx < step && px + dx < size; dx += 1) {
          const i = (py + dy) * size + px + dx
          const target = near.sea ? 0 : Math.min(original[i], cap)
          if (target !== original[i]) {
            encode(rgba, i, target)
            changed += 1
          }
        }
      }
    }
  }
  return changed
}

/** z/x/y out of a Terrarium tile URL, or null for anything else. */
export function terrariumTileOf(url: string): TileAddress | null {
  const m = /\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url)
  return m === null ? null : { z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) }
}

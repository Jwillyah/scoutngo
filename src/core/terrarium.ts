/*
 * TERRARIUM ELEVATION, AS HEIGHTS A 3D GLOBE CAN DRAPE.
 *
 * The same AWS Terrarium tiles the 2D map's terrain reads
 * (src/lib/offlineSources.ts TERRAIN_TEMPLATE): a 256 px PNG per Web
 * Mercator tile, each pixel's height packed into its colour,
 *
 *   metres = R * 256 + G + B / 256 - 32768
 *
 * The 3D view asks for a small grid of heights per tile, north row first,
 * edge to edge, so that neighbouring tiles share their edge samples. Past the
 * source's deepest zoom it asks again, and the grid is cut from the deepest
 * ancestor tile: the ground is not invented finer than it was measured.
 */

/*
 * WATER AT ITS SURFACE. Terrarium carries the river and sea bed under
 * water: at Brew River the Wicomico's channel reads -13 to -58 m, and draped
 * with the photograph of the water's surface it showed as a pit with walls.
 * The model is for standing on the bank and looking across, so heights below
 * sea level are drawn at sea level. The cost, said plainly: land that really
 * is below sea level (Death Valley, the Dutch polders) is drawn flat at 0.
 */
export const SEA_LEVEL_FLOOR = 0

/** The source's deepest zoom (src/lib/offlineSources.ts TERRAIN_ZOOMS). */
export const TERRARIUM_MAX_ZOOM = 15
export const TERRARIUM_TILE_PX = 256

export const terrariumMetres = (r: number, g: number, b: number): number => r * 256 + g + b / 256 - 32768

export interface TileAddress {
  x: number
  y: number
  z: number
}

/**
 * Which source tile holds a requested tile, and which part of it: the tile
 * itself up to the deepest zoom, else its ancestor at that zoom and the
 * fraction of it (offset and span, 0 to 1) the requested tile covers.
 */
export function sourceFor(tile: TileAddress, maxZoom = TERRARIUM_MAX_ZOOM): { tile: TileAddress; u0: number; v0: number; span: number } {
  if (tile.z <= maxZoom) return { tile, u0: 0, v0: 0, span: 1 }
  const d = tile.z - maxZoom
  const n = 2 ** d
  return {
    tile: { x: Math.floor(tile.x / n), y: Math.floor(tile.y / n), z: maxZoom },
    u0: (tile.x % n) / n,
    v0: (tile.y % n) / n,
    span: 1 / n,
  }
}

/**
 * An n x n grid of heights from a decoded tile (RGBA, size x size), over the
 * part of it from (u0, v0) spanning `span`, bilinear between pixel centres.
 * Row 0 is the north edge.
 */
export function heightGrid(rgba: ArrayLike<number>, size: number, n: number, u0 = 0, v0 = 0, span = 1): Float32Array {
  const at = (px: number, py: number) => {
    const x = Math.min(size - 1, Math.max(0, px))
    const y = Math.min(size - 1, Math.max(0, py))
    const i = (y * size + x) * 4
    return terrariumMetres(rgba[i], rgba[i + 1], rgba[i + 2])
  }
  const out = new Float32Array(n * n)
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      /* Edge to edge: sample 0 is the tile's west edge, sample n-1 its east edge. */
      const fx = (u0 + (span * i) / (n - 1)) * size - 0.5
      const fy = (v0 + (span * j) / (n - 1)) * size - 0.5
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const tx = fx - x0
      const ty = fy - y0
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
      out[j * n + i] = Math.max(SEA_LEVEL_FLOOR, top * (1 - ty) + bottom * ty)
    }
  }
  return out
}

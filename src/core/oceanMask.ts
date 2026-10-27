/*
 * THE SEA, FROM THE MAP TILES' OCEAN POLYGONS, ON AN ELEVATION TILE.
 *
 * OpenFreeMap's vector tiles (OpenMapTiles schema) carry the sea as polygons:
 * the `water` layer, class `ocean`, built from OpenStreetMap's coastline. A
 * vector tile and an elevation tile are both Web Mercator squares, so a
 * terrain pixel's place in the vector tile is a scale and an offset, no
 * longitude or latitude in between.
 *
 * What is done with it is what src/core/seaTile.ts did with the coastline
 * ways: every pixel in the sea at 0 m, and the shore band (SHORE_BAND_M on
 * the land side) no higher than the land behind it plus SHORE_MARGIN_M, so
 * the bumps Terrarium leaves standing on the waterline come down to the sand
 * while a real cliff, with high land behind it, keeps its height.
 */
import { SHORE_BAND_M, SHORE_MARGIN_M, type TileAddress } from './seaTile.ts'

export interface TilePoint {
  x: number
  y: number
}

/** Twice the signed area, in tile coordinates (y down). */
export function ringArea(ring: readonly TilePoint[]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y)
  return sum
}

/**
 * A ring cut to the square [lo, hi] on both axes (Sutherland-Hodgman). Vector
 * tiles carry a buffer past their edge, so a building across two tiles comes
 * in both; cut to the tile's own square, the two halves meet at the edge
 * instead of overlapping. Fewer than three points left: empty.
 */
export function clipRingToSquare(ring: readonly TilePoint[], lo: number, hi: number): TilePoint[] {
  type Edge = { inside: (p: TilePoint) => boolean; cross: (a: TilePoint, b: TilePoint) => TilePoint }
  const at = (a: TilePoint, b: TilePoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const edges: Edge[] = [
    { inside: (p) => p.x >= lo, cross: (a, b) => at(a, b, (lo - a.x) / (b.x - a.x)) },
    { inside: (p) => p.x <= hi, cross: (a, b) => at(a, b, (hi - a.x) / (b.x - a.x)) },
    { inside: (p) => p.y >= lo, cross: (a, b) => at(a, b, (lo - a.y) / (b.y - a.y)) },
    { inside: (p) => p.y <= hi, cross: (a, b) => at(a, b, (hi - a.y) / (b.y - a.y)) },
  ]
  /* Open ring in, open ring out: a closing point repeated would be cut twice. */
  let out: TilePoint[] = ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y ? ring.slice(0, -1) : [...ring]
  for (const edge of edges) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i += 1) {
      const cur = input[i]
      const prev = input[(i + input.length - 1) % input.length]
      if (edge.inside(cur)) {
        if (!edge.inside(prev)) out.push(edge.cross(prev, cur))
        out.push(cur)
      } else if (edge.inside(prev)) out.push(edge.cross(prev, cur))
    }
    if (out.length === 0) return []
  }
  return out.length < 3 ? [] : out
}

/**
 * Which pixels of an elevation tile are in the sea. `features` is the ocean
 * features of the vector tile `vector`, each a list of rings in its tile
 * coordinates (0 to `extent`); a pixel is in the sea when its centre is
 * inside a feature by the even-odd rule, which reads a hole as a hole. The
 * vector tile's zoom must not be above the elevation tile's: the elevation
 * tile then lies inside it.
 *
 * `margin` pixels more on every side, read from the rest of the vector tile
 * or its buffer: a pixel on the tile's edge may have its sea in the next
 * tile. The mask is (size + 2 margin) square, pixel (0, 0) of the tile at
 * (margin, margin).
 */
export function oceanMask(
  features: readonly (readonly (readonly TilePoint[])[])[],
  vector: TileAddress,
  extent: number,
  tile: TileAddress,
  size: number,
  margin = 0,
): Uint8Array {
  if (vector.z > tile.z) throw new Error('the vector tile must not be deeper than the elevation tile')
  const scale = 2 ** (tile.z - vector.z)
  /* Pixel (px, py)'s centre in the vector tile's coordinates. */
  const ox = (tile.x / scale - vector.x) * extent
  const oy = (tile.y / scale - vector.y) * extent
  const step = extent / (scale * size)
  const width = size + 2 * margin
  const mask = new Uint8Array(width * width)
  const crossings: number[] = []
  for (const rings of features) {
    for (let my = 0; my < width; my += 1) {
      const y = oy + (my - margin + 0.5) * step
      crossings.length = 0
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[j]
          const b = ring[i]
          if (a.y > y !== b.y > y) crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
        }
      }
      if (crossings.length < 2) continue
      crossings.sort((p, q) => p - q)
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        /* Pixels whose centre lies between this pair of crossings. */
        const from = Math.max(0, Math.ceil((crossings[k] - ox) / step - 0.5) + margin)
        const to = Math.min(width - 1, Math.floor((crossings[k + 1] - ox) / step - 0.5) + margin)
        for (let mx = from; mx <= to; mx += 1) mask[my * width + mx] = 1
      }
    }
  }
  return mask
}

export interface OceanCleanResult {
  /** Pixels in the sea, written 0 m. */
  sea: number
  /** Land pixels in the shore band brought down to the land behind them. */
  shore: number
}

/**
 * Cleans heights in place against an ocean mask: the sea at 0 m, the shore
 * band no higher than the land SHORE_BAND_M inland plus SHORE_MARGIN_M.
 * Inland is away from the sea in reach, the nearer the heavier; the land
 * behind is read from the tile, or past its edge from `outside`.
 */
/** How many pixels of margin the shore band needs around a tile at this pixel size. */
export const shoreReach = (metresPerPixel: number): number => Math.ceil(SHORE_BAND_M / metresPerPixel)

/**
 * `outside`, when given, reads the raw height of a pixel past the tile's edge
 * (x or y below 0 or from size), from the neighbouring tile, or null when that
 * tile cannot be had: the land behind a pixel on the edge is often there.
 */
export function cleanAgainstOcean(
  heights: Float32Array,
  mask: Uint8Array,
  size: number,
  metresPerPixel: number,
  margin = 0,
  outside?: (x: number, y: number) => number | null,
): OceanCleanResult {
  const original = Float32Array.from(heights)
  const reach = shoreReach(metresPerPixel)
  const width = size + 2 * margin
  const seaAt = (x: number, y: number) => x >= -margin && x < size + margin && y >= -margin && y < size + margin && mask[(y + margin) * width + x + margin] === 1
  let sea = 0
  let shore = 0
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const i = py * size + px
      if (seaAt(px, py) && heights[i] !== 0) {
        heights[i] = 0
        sea += 1
      }
    }
  }
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const i = py * size + px
      if (seaAt(px, py)) continue
      /*
       * The nearest sea pixel within the band, and inland: away from all the
       * sea in reach, the nearer the heavier (1/r³). Away from the single
       * nearest one is not enough: on a staircase edge two sea pixels tie,
       * and picking the one along the coast sent "inland" down the beach,
       * into Terrarium's wedge spilled two pixels onto the land, and a 37 m
       * pixel at Virginia Beach was capped at 37 m.
       */
      let best = Infinity
      let ax = 0
      let ay = 0
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          if (!seaAt(px + dx, py + dy)) continue
          const d = dx * dx + dy * dy
          if (d < best) best = d
          ax -= dx / (d * d)
          ay -= dy / (d * d)
        }
      }
      if (best === Infinity) continue
      const distance = Math.sqrt(best) * metresPerPixel
      const away = Math.hypot(ax, ay)
      if (distance >= SHORE_BAND_M || away === 0) continue
      /* SHORE_BAND_M from the sea, straight inland. */
      const ahead = (SHORE_BAND_M - distance) / metresPerPixel / away
      const bx = Math.round(px + ax * ahead)
      const by = Math.round(py + ay * ahead)
      const onTile = bx >= 0 && bx < size && by >= 0 && by < size
      /* Past the edge: the neighbouring tile, or failing that the nearest pixel on this one. */
      const behind = onTile
        ? original[by * size + bx]
        : (outside?.(bx, by) ?? original[Math.min(size - 1, Math.max(0, by)) * size + Math.min(size - 1, Math.max(0, bx))])
      const cap = Math.max(0, behind) + SHORE_MARGIN_M
      if (heights[i] > cap) {
        heights[i] = cap
        shore += 1
      }
    }
  }
  return { sea, shore }
}

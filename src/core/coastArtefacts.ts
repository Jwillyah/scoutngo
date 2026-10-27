/*
 * THE ELEVATION'S OWN COASTLINE: cleaning a coastal tile with no map data.
 *
 * WHY THIS EXISTS. The sea is put at sea level against OpenStreetMap's
 * coastline (src/core/seaTile.ts), and the coastline comes from Overpass.
 * At Virginia Beach on 26 Oct Overpass did not answer from any of its three
 * servers, the cleanup had nothing to clean against, and the cliffs came
 * back. The elevation has to be cleaned without it; the coastline makes the
 * result better, it is never required.
 *
 * WHAT THE ARTEFACT LOOKS LIKE, in the raw tiles at the pier. From the town
 * the ground falls to the beach at a metre or two. Then, in a single pixel,
 * it jumps up, and from there a wedge of invented ground hundreds of metres
 * wide slopes gently down to where the tile finally reads the sea bed, with
 * blobs standing on it: 24.60 m on the pier 84 m out, steps of 52.99 m along
 * the shoreline (measurements/2026-10-27-terrain-virginia-beach-no-overpass.md,
 * the raw column). Zooms 13, 14 and 15 all carry it
 * (measurements/2026-10-27-coast-artefacts.md, the raw columns).
 *
 * THE TWO RULES ASKED FOR, AND WHY A THIRD WAS NEEDED.
 *   1. Sea is where the tile reads 0 or below: drawn at 0.
 *   2. Isolated spikes standing more than 3 m above the median of their
 *      neighbours come down to that median. Only within REACH_M of the open
 *      sea and where that median is at sea level: run everywhere, it took
 *      the edges off Dover's cliff tops.
 * Neither touches the wedge: it reads above 0, and it is a plateau hundreds
 * of metres wide, not a spike. So:
 *   3. A WALL is a drop steeper than WALL_DEGREES (a cliff no beach has) from
 *      ground that slopes down to the open sea without climbing, onto ground
 *      at sea level (SHORE_MAX_M or less) on its landward side. Everything
 *      above the beach that is joined to a wall's top, and lies closer to the
 *      open sea than the nearest beach, is in the sea, and drawn at 0.
 *      Repeated until nothing changes, so blobs left standing in the
 *      cleared water become walls in their turn. The low water between
 *      the cleared ground and the open sea goes to 0 with it, so where
 *      the clearing stops does not depend on the zoom.
 *
 * WHAT IT IS NOT ALLOWED TO TOUCH, checked on real coasts and recorded in
 * measurements/2026-10-27-coast-artefacts.md: Dover's chalk, Big Sur and
 * Point Lobos (a real cliff drops toward the sea, never away from it) come
 * through with nothing cleared by the wall rule, and Jockey's Ridge (a dune
 * slopes, it does not stand vertical) keeps its dune. Its costs, said
 * plainly: a vertical wall of real ground over a beach with the open sea
 * behind it, a seawall's top for example, is read as the artefact and drawn
 * at sea level; on the sound side of Jockey's Ridge a strip along the
 * waterline is; and spikes come down on ground near sea level, real ones
 * included.
 *
 * Works in metres, on a grid with a margin around the tile that is wanted,
 * so a wedge that starts in the next tile is still seen whole.
 */

/** Below this share of the grid, ground at or under 0 is a pond or a pocket, not the open sea. */
export const OPEN_SEA_SHARE = 0.02
/** A smaller stretch touching the grid's edge still counts: it carries on past the edge. */
export const OPEN_SEA_EDGE_SHARE = 0.005
/** Steeper than this from the water side onto the beach: no real shore stands like that. */
export const WALL_DEGREES = 60
/** The beach at the wall's foot is at sea level: this high or lower. */
export const SHORE_MAX_M = 2
/** The cleared ground may sit this far above the beach and stay. */
export const SHORE_MARGIN_M = 1
/** A wall's top must reach the open sea climbing no more than this in all. */
export const CLIMB_M = 3
/** The step that counts: the user's 3 m, for spikes and for the beach under a wall. */
export const STEP_M = 3
/** Nothing further than this from the open sea is looked at. */
export const REACH_M = 600
export const PASSES = 6
/** Spikes: the median of the 7 x 7 block around a pixel. */
export const SPIKE_RADIUS = 3

export interface CoastCleanResult {
  /** Pixels drawn at sea level by the wall rule. */
  cleared: number
  /** Pixels brought down to their neighbours' median. */
  spikes: number
  /** Pixels that read below 0 and were drawn at 0. */
  belowSea: number
}

/**
 * Cleans `h` (metres, row by row, `width` x `height`) in place. Every pixel
 * of the grid is cleaned; the caller keeps the part it wants.
 */
export function cleanCoastalHeights(h: Float32Array, width: number, height: number, metresPerPixel: number): CoastCleanResult {
  const n = width * height
  const raw = Float32Array.from(h)
  const result: CoastCleanResult = { cleared: 0, spikes: 0, belowSea: 0 }

  /* Rule 1: the sea at sea level. */
  for (let i = 0; i < n; i += 1) {
    if (h[i] < 0) {
      h[i] = 0
      result.belowSea += 1
    }
  }

  const sea = openSea(raw, width, height)
  if (sea === null) return result

  const reach = Math.ceil(REACH_M / metresPerPixel)
  const wallDrop = Math.max(STEP_M, Math.tan((WALL_DEGREES * Math.PI) / 180) * metresPerPixel)
  const dist = distanceFrom(sea, width, height)

  for (let pass = 0; pass < PASSES; pass += 1) {
    const cleared = wallPass(h, raw, sea, dist, width, height, reach, wallDrop)
    result.cleared += cleared
    if (cleared === 0) break
  }
  result.spikes = spikePass(h, sea, dist, width, height, reach)
  return result
}

/* ------------------------------------------------------------- the pieces */

const neighbours = (width: number) => [1, -1, width, -width]

function inGrid(i: number, d: number, width: number, n: number): boolean {
  const x = i % width
  if (d === 1 && x === width - 1) return false
  if (d === -1 && x === 0) return false
  const j = i + d
  return j >= 0 && j < n
}

/** The open sea: stretches at or under 0 big enough (or reaching the edge) to be it. Null when there is none. */
function openSea(raw: Float32Array, width: number, height: number): Uint8Array | null {
  const n = width * height
  const seen = new Uint8Array(n)
  const sea = new Uint8Array(n)
  const nb = neighbours(width)
  let any = false
  const stack: number[] = []
  const members: number[] = []
  for (let s = 0; s < n; s += 1) {
    if (seen[s] === 1 || raw[s] > 0) continue
    seen[s] = 1
    stack.push(s)
    members.length = 0
    let edge = false
    while (stack.length > 0) {
      const i = stack.pop() as number
      members.push(i)
      const x = i % width
      const y = (i - x) / width
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true
      for (const d of nb) {
        if (!inGrid(i, d, width, n)) continue
        const j = i + d
        if (seen[j] === 1 || raw[j] > 0) continue
        seen[j] = 1
        stack.push(j)
      }
    }
    if (members.length >= OPEN_SEA_SHARE * n || (edge && members.length >= OPEN_SEA_EDGE_SHARE * n)) {
      any = true
      for (const i of members) sea[i] = 1
    }
  }
  return any ? sea : null
}

/** Steps from the open sea, four-way. */
function distanceFrom(sea: Uint8Array, width: number, height: number): Int32Array {
  const n = width * height
  const dist = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let tail = 0
  for (let i = 0; i < n; i += 1) {
    if (sea[i] === 1) {
      dist[i] = 0
      queue[tail++] = i
    }
  }
  const nb = neighbours(width)
  for (let head = 0; head < tail; head += 1) {
    const i = queue[head]
    for (const d of nb) {
      if (!inGrid(i, d, width, n)) continue
      const j = i + d
      if (dist[j] !== -1) continue
      dist[j] = dist[i] + 1
      queue[tail++] = j
    }
  }
  return dist
}

/** One pass of rule 3. Returns how many pixels it drew at sea level. */
function wallPass(
  h: Float32Array,
  raw: Float32Array,
  sea: Uint8Array,
  dist: Int32Array,
  width: number,
  height: number,
  reach: number,
  wallDrop: number,
): number {
  const n = width * height
  const nb = neighbours(width)

  /* How much a walk to the open sea climbs, along the shortest way there. */
  const climb = new Float32Array(n)
  const order = new Int32Array(n)
  let count = 0
  for (let i = 0; i < n; i += 1) if (dist[i] >= 0) order[count++] = i
  const sorted = order.subarray(0, count).sort((a, b) => dist[a] - dist[b])
  for (const j of sorted) {
    if (dist[j] === 0) continue
    let best = Infinity
    for (const d of nb) {
      if (!inGrid(j, d, width, n)) continue
      const i = j + d
      if (dist[i] !== dist[j] - 1) continue
      best = Math.min(best, climb[i] + Math.max(0, h[i] - h[j]))
    }
    climb[j] = best
  }

  /* The beach: real ground at sea level with something more than STEP_M above it on the sea side. */
  const shore = new Uint8Array(n)
  for (let i = 0; i < n; i += 1) {
    if (sea[i] === 1 || raw[i] <= 0 || h[i] > SHORE_MAX_M || dist[i] > reach) continue
    for (const d of nb) {
      if (!inGrid(i, d, width, n)) continue
      const k = i + d
      if (sea[k] === 1 || dist[k] >= dist[i]) continue
      if (h[k] - h[i] > STEP_M) {
        shore[i] = 1
        break
      }
    }
  }

  /* Each pixel's nearest beach pixel, so "seaward of the beach" is decided where it is. */
  const nearest = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let tail = 0
  for (let i = 0; i < n; i += 1) {
    if (shore[i] === 1) {
      nearest[i] = i
      queue[tail++] = i
    }
  }
  if (tail === 0) return 0
  for (let head = 0; head < tail; head += 1) {
    const i = queue[head]
    for (const d of nb) {
      if (!inGrid(i, d, width, n)) continue
      const j = i + d
      if (nearest[j] !== -1) continue
      nearest[j] = nearest[i]
      queue[tail++] = j
    }
  }
  const seaward = (j: number) => nearest[j] >= 0 && dist[j] < dist[nearest[j]]

  /* The walls, then everything above the beach joined to them on the sea side. */
  const gone = new Uint8Array(n)
  const level = new Float32Array(n)
  const stack: number[] = []
  for (let i = 0; i < n; i += 1) {
    if (h[i] <= 0 || sea[i] === 1 || dist[i] > reach || climb[i] > CLIMB_M) continue
    let low = Infinity
    for (const d of nb) {
      if (!inGrid(i, d, width, n)) continue
      const j = i + d
      if (shore[j] === 1 && h[i] - h[j] > wallDrop) low = Math.min(low, h[j])
    }
    if (low < Infinity) {
      gone[i] = 1
      level[i] = low + SHORE_MARGIN_M
      stack.push(i)
    }
  }
  while (stack.length > 0) {
    const i = stack.pop() as number
    for (const d of nb) {
      if (!inGrid(i, d, width, n)) continue
      const j = i + d
      if (gone[j] === 1 || sea[j] === 1 || !seaward(j) || h[j] <= level[i]) continue
      gone[j] = 1
      level[j] = level[i]
      stack.push(j)
    }
  }
  /*
   * THE LOW WATER BEYOND IT. Between the cleared ground and the open sea the
   * wedge thins to a metre or two; left standing, where it stopped depended on
   * the zoom, and the 2D map and the 3D model (reading different zooms)
   * disagreed by a metre at the pier. Ground no higher than the beach, joined
   * to the cleared ground, seaward of the beach and no further from the sea
   * than the cleared ground, is sea too. The beach itself never is.
   */
  for (let i = 0; i < n; i += 1) if (gone[i] === 1) stack.push(i)
  while (stack.length > 0) {
    const i = stack.pop() as number
    for (const d of nb) {
      if (!inGrid(i, d, width, n)) continue
      const j = i + d
      if (gone[j] === 1 || sea[j] === 1 || shore[j] === 1 || !seaward(j) || h[j] <= 0 || h[j] > level[i] || dist[j] > dist[i]) continue
      gone[j] = 1
      level[j] = level[i]
      stack.push(j)
    }
  }

  let cleared = 0
  for (let i = 0; i < n; i += 1) {
    if (gone[i] === 1 && h[i] > 0) {
      h[i] = 0
      cleared += 1
    }
  }
  return cleared
}

/** Rule 2, near the sea and on ground at sea level: a pixel standing more than STEP_M over its neighbours' median. */
function spikePass(h: Float32Array, sea: Uint8Array, dist: Int32Array, width: number, height: number, reach: number): number {
  const r = SPIKE_RADIUS
  const side = 2 * r + 1
  const others = side * side - 1
  const window = new Float32Array(others)
  let total = 0
  for (let pass = 0; pass < 3; pass += 1) {
    const src = Float32Array.from(h)
    let changed = 0
    for (let y = r; y < height - r; y += 1) {
      for (let x = r; x < width - r; x += 1) {
        const i = y * width + x
        const v = src[i]
        if (sea[i] === 1 || dist[i] > reach || v <= STEP_M) continue
        /* The median is at sea level only if half the block is: count before sorting. */
        let low = 0
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) if ((dx !== 0 || dy !== 0) && src[i + dy * width + dx] <= SHORE_MAX_M) low += 1
        }
        if (low < others / 2) continue
        let k = 0
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) if (dx !== 0 || dy !== 0) window[k++] = src[i + dy * width + dx]
        }
        window.sort()
        const median = (window[others / 2 - 1] + window[others / 2]) / 2
        if (median <= SHORE_MAX_M && v - median > STEP_M) {
          h[i] = median
          changed += 1
        }
      }
    }
    total += changed
    if (changed === 0) break
  }
  return total
}

/* ---------------------------------------------------- one tile in context */

/**
 * How much of the neighbouring tiles is read around the one being cleaned:
 * half a tile each side, because the wedge is wider than a quarter of a tile
 * at zoom 15. Cleaned one tile at a time with 128 pixels the pier's
 * shoreline came out within the limit at zooms 13 to 15; with 64 the step
 * along it at zoom 15 was still 16.18 m
 * (measurements/2026-10-27-coast-artefacts.md).
 */
export const CONTEXT_MARGIN_PX = 128

/**
 * Cleans one tile (`size` x `size` metres) with its eight neighbours around
 * it, row by row from the north-west, the tile itself in the middle (index
 * 4). A neighbour that could not be had is null: its strip is filled with the
 * tile's own nearest edge. Returns the tile's cleaned heights.
 */
export function cleanTileInContext(
  tiles: readonly (Float32Array | null)[],
  size: number,
  metresPerPixel: number,
  margin = CONTEXT_MARGIN_PX,
): { heights: Float32Array; result: CoastCleanResult } {
  const side = size + 2 * margin
  const grid = new Float32Array(side * side)
  const centre = tiles[4] as Float32Array
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      /* Where this grid pixel falls: which tile, and where in it. */
      const gx = x - margin
      const gy = y - margin
      const tx = gx < 0 ? 0 : gx >= size ? 2 : 1
      const ty = gy < 0 ? 0 : gy >= size ? 2 : 1
      const tile = tiles[ty * 3 + tx]
      let v: number
      if (tile !== null && tile !== undefined) {
        const lx = gx - (tx - 1) * size
        const ly = gy - (ty - 1) * size
        v = tile[ly * size + lx]
      } else {
        v = centre[Math.min(size - 1, Math.max(0, gy)) * size + Math.min(size - 1, Math.max(0, gx))]
      }
      grid[y * side + x] = v
    }
  }
  const result = cleanCoastalHeights(grid, side, side, metresPerPixel)
  const heights = new Float32Array(size * size)
  for (let y = 0; y < size; y += 1) heights.set(grid.subarray((y + margin) * side + margin, (y + margin) * side + margin + size), y * size)
  return { heights, result }
}

/** Ground across one pixel of a Web Mercator tile at zoom z and this latitude. */
export const metresPerPixel = (lat: number, z: number, size = 256): number =>
  (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (size * 2 ** z)

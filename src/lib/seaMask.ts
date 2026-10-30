/*
 * THE SEA AT SEA LEVEL, IN EVERY ELEVATION TILE BOTH VIEWS READ.
 *
 * Every terrain tile the 2D map and the 3D model read comes through loadTile
 * (offlineCache.ts), which hands it here first, so the two views cannot
 * disagree about where the sea is.
 *
 * WITH THE MAP TILES' OCEAN (OpenFreeMap's `water` layer, class `ocean`,
 * src/lib/vectorTiles.ts): the elevation tile is cleaned against the ocean
 * polygons of the vector tile over it (src/core/oceanMask.ts), read through
 * the same cache as the photograph. The vector tile is waited for before the
 * elevation tile is handed over, so a tile is cleaned once and never redrawn
 * when the sea arrives later. That redraw, when the coastline came from
 * Overpass after the tiles, threw the 3D globe away and loaded it again.
 *
 * WITHOUT IT (not saved and no signal, or the tile refused), the elevation
 * is cleaned anyway, from its own shape (src/core/coastArtefacts.ts): below 0
 * drawn at 0, the invented wedge off a beach drawn at sea level, isolated
 * spikes brought down.
 */
import { decodePng as readPng, encodePng as writePng, type Pixels } from './png.ts'
import type { Position } from '../core/geo.ts'
import { metresPerPixel, SHORE_MAX_M } from '../core/coastArtefacts.ts'
import { cleanAgainstOcean, oceanMask, shoreReach } from '../core/oceanMask.ts'
import { decode, encode, terrariumTileOf, tilePointLonLat, type TileAddress } from '../core/seaTile.ts'
import type { CoastJob } from './coastWorker.ts'
import { loadVectorTile, oceanFeatures, vectorExtent, vectorTileFor } from './vectorTiles.ts'

/*
 * A TILE WHOSE LOWEST POINT IS ABOVE THIS HAS NO SEA IN IT, and no vector
 * tile is asked for. The tallest thing Terrarium invents over the sea at
 * Virginia Beach is a 52.99 m step (measurements/2026-10-26-terrain-virginia-beach.md,
 * the raw column), so a tile with sea in it has ground under this somewhere.
 */
export const SEA_GATE_M = 100

/*
 * How many tiles each way has cleaned, by zoom: against the map tiles' ocean,
 * or from the elevation's own shape. With ?probe=1 on window.__probe.seaTiles.
 */
const cleanedBy: Record<'ocean' | 'shape', Record<number, number>> = { ocean: {}, shape: {} }
const count = (path: 'ocean' | 'shape', z: number) => (cleanedBy[path][z] = (cleanedBy[path][z] ?? 0) + 1)
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('probe') === '1') {
  const w = window as unknown as { __probe?: Record<string, unknown> }
  w.__probe = { ...(w.__probe ?? {}), seaTiles: () => JSON.parse(JSON.stringify(cleanedBy)) as typeof cleanedBy }
}

/*
 * OpenStreetMap coastline ways out of an Overpass answer, in their own order
 * (the sea is on the right). The app no longer asks for them; the measuring
 * scripts read a saved copy as the ground truth for where the shore is.
 */
export function parseCoastlines(payload: unknown): Position[][] {
  const elements = (payload as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elements)) return []
  const out: Position[][] = []
  for (const e of elements as { type?: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[]) {
    if (e.type !== 'way' || e.tags?.natural !== 'coastline' || !Array.isArray(e.geometry) || e.geometry.length < 2) continue
    out.push(e.geometry.map((p) => [p.lon, p.lat] as Position))
  }
  return out
}

/* --------------------------------------------------------- the cleaning */

/** A neighbouring tile's raw bytes, or null when it cannot be had. Supplied by the tile loader. */
export type RawTileLoader = (url: string) => Promise<ArrayBuffer | null>

/* One promise per tile URL: the map and the 3D view ask for the same tiles, and the neighbours overlap. */
const cleaned = new Map<string, Promise<ArrayBuffer>>()
const CLEANED_KEPT = 128

/**
 * A terrain tile's bytes with the sea at sea level: against the ocean in the
 * map tile over it, or, when that cannot be had, from the elevation's own
 * shape, reading the tile's neighbours through `neighbour` (none given: the
 * tile alone). Decoded and re-encoded as PNG with no colour conversion, so
 * the packed heights survive exactly. Bytes that need no change come back as
 * they were.
 */
export function cleanTerrainBytes(url: string, bytes: ArrayBuffer, neighbour?: RawTileLoader): Promise<ArrayBuffer> {
  const tile = terrariumTileOf(url)
  if (tile === null) return Promise.resolve(bytes)
  const hit = cleaned.get(url)
  if (hit !== undefined) return hit
  const run = clean(url, tile, bytes, neighbour).catch(() => bytes)
  cleaned.set(url, run)
  if (cleaned.size > CLEANED_KEPT) cleaned.delete(cleaned.keys().next().value as string)
  return run
}

async function clean(url: string, tile: TileAddress, bytes: ArrayBuffer, neighbour: RawTileLoader | undefined): Promise<ArrayBuffer> {
  const image = await decodePng(bytes)
  if (image === null) return bytes
  const size = image.width
  const heights = new Float32Array(size * size)
  for (let i = 0; i < size * size; i += 1) heights[i] = decode(image.data, i)
  const around = neighbour === undefined ? undefined : (dx: number, dy: number) => neighbourHeights(url, tile, dx, dy, size, neighbour)
  const result = await cleanHeights(tile, heights, size, around)
  if (result.changed === 0) return bytes
  for (let i = 0; i < size * size; i += 1) encode(image.data, i, heights[i])
  return encodePng(image)
}

export type CleanPath = 'ocean' | 'shape' | 'none'

const NEIGHBOURS: readonly [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]

/**
 * The cleaning itself, on decoded heights, in place: against the ocean in
 * the map tile over this one when it can be had, else from the elevation's
 * own shape with the neighbours `around` supplies. Says which way it went
 * and how many pixels changed.
 */
export async function cleanHeights(
  tile: TileAddress,
  heights: Float32Array,
  size: number,
  around?: (dx: number, dy: number) => Promise<Float32Array | null>,
): Promise<{ path: CleanPath; changed: number }> {
  let lowest = Infinity
  for (let i = 0; i < size * size; i += 1) if (heights[i] < lowest) lowest = heights[i]
  if (lowest > SEA_GATE_M) return { path: 'none', changed: 0 }
  const mpp = metresPerPixel(tilePointLonLat(tile, 0.5, 0.5).lat, tile.z, size)

  /* The map tile's ocean, when there is one to be had. */
  const over = vectorTileFor(tile)
  const vector = over === null ? null : await loadVectorTile(over)
  if (over !== null && vector !== null) {
    count('ocean', tile.z)
    const features = oceanFeatures(vector)
    /* The map says there is no sea here: as it came. */
    if (features.length === 0) return { path: 'ocean', changed: 0 }
    const margin = shoreReach(mpp)
    /* The land behind a pixel on the edge is in the next tile: the eight around, read raw, when they can be had. */
    const ring = around === undefined ? null : await Promise.all(NEIGHBOURS.map(([dx, dy]) => around(dx, dy)))
    const outside =
      ring === null
        ? undefined
        : (x: number, y: number) => {
            const dx = x < 0 ? -1 : x >= size ? 1 : 0
            const dy = y < 0 ? -1 : y >= size ? 1 : 0
            const other = ring[NEIGHBOURS.findIndex(([a, b]) => a === dx && b === dy)]
            if (other === null || other === undefined) return null
            const ox = x - dx * size
            const oy = y - dy * size
            return ox >= 0 && ox < size && oy >= 0 && oy < size ? other[oy * size + ox] : null
          }
    const result = cleanAgainstOcean(heights, oceanMask(features, over, vectorExtent(vector), tile, size, margin), size, mpp, margin, outside)
    return { path: 'ocean', changed: result.sea + result.shore }
  }

  /* No map tile: from the elevation's own shape. A tile with no ground at sea level has no shore and no sea in it: as it came. */
  if (lowest > SHORE_MAX_M) return { path: 'none', changed: 0 }
  count('shape', tile.z)
  const tiles: (Float32Array | null)[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) tiles.push(heights)
      else tiles.push(around === undefined ? null : await around(dx, dy))
    }
  }
  const out = await runCoastJob({ id: 0, tiles, size, metresPerPixel: mpp })
  heights.set(out.heights)
  return { path: 'shape', changed: out.changed }
}

/* --------------------------------------------------------- neighbours */

const decodedNeighbours = new Map<string, Promise<Float32Array | null>>()
const NEIGHBOURS_KEPT = 48

function neighbourHeights(url: string, tile: TileAddress, dx: number, dy: number, size: number, load: RawTileLoader): Promise<Float32Array | null> {
  const n = 2 ** tile.z
  const y = tile.y + dy
  if (y < 0 || y >= n) return Promise.resolve(null)
  const x = (((tile.x + dx) % n) + n) % n
  const other = url.replace(/\/(\d+)\/(\d+)\/(\d+)\.png$/, `/${tile.z}/${x}/${y}.png`)
  const hit = decodedNeighbours.get(other)
  if (hit !== undefined) return hit
  const run = (async () => {
    const raw = await load(other)
    if (raw === null) return null
    const image = await decodePng(raw)
    if (image === null || image.width !== size) return null
    const out = new Float32Array(size * size)
    for (let i = 0; i < size * size; i += 1) out[i] = decode(image.data, i)
    return out
  })().catch(() => null)
  decodedNeighbours.set(other, run)
  if (decodedNeighbours.size > NEIGHBOURS_KEPT) decodedNeighbours.delete(decodedNeighbours.keys().next().value as string)
  return run
}

/* ----------------------------------------------------------- the worker */

let worker: Worker | null | undefined
let nextId = 1
const waiting = new Map<number, (out: { heights: Float32Array; changed: number }) => void>()

async function runCoastJob(job: CoastJob): Promise<{ heights: Float32Array; changed: number }> {
  if (worker === undefined) {
    try {
      worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./coastWorker.ts', import.meta.url), { type: 'module' })
      worker?.addEventListener('message', (event: MessageEvent<{ id: number; heights: Float32Array; changed: number }>) => {
        waiting.get(event.data.id)?.(event.data)
        waiting.delete(event.data.id)
      })
    } catch {
      worker = null
    }
  }
  if (worker === null) {
    /* No workers here (the tests): the same code, on this thread. */
    const { cleanTileInContext } = await import('../core/coastArtefacts.ts')
    const { heights, result } = cleanTileInContext(job.tiles, job.size, job.metresPerPixel)
    return { heights, changed: result.cleared + result.spikes + result.belowSea }
  }
  const id = nextId++
  const live = worker
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    live.postMessage({ ...job, id })
  })
}

/* ------------------------------------------------------------- the PNGs */

/*
 * READ FROM THE FILE'S BYTES, NOT A CANVAS (29 Oct). WebKit adds noise to
 * pixels read back from a canvas when script drew them; an elevation tile is
 * numbers, and one unit in its red byte is 256 m. Measured in WebKit the image
 * path came back exact (scripts/audit-terrain-decode.mjs), but the heights no
 * longer depend on that: src/lib/png.ts reads and writes the PNG itself.
 */
async function decodePng(bytes: ArrayBuffer): Promise<Pixels | null> {
  try {
    return await readPng(bytes)
  } catch {
    return null
  }
}

const encodePng = (image: Pixels): Promise<ArrayBuffer> => writePng(image)

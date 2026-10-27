/*
 * THE SEA AT SEA LEVEL, IN EVERY ELEVATION TILE BOTH VIEWS READ.
 *
 * Every terrain tile the 2D map and the 3D model read comes through loadTile
 * (offlineCache.ts), which hands it here first, so the two views cannot
 * disagree about where the sea is.
 *
 * WITH THE COASTLINE (OpenStreetMap's, fetched with the rest of the place in
 * one request, src/lib/place.ts, and kept on the phone): tiles near the venue
 * are cleaned against it (src/core/seaTile.ts). That is the better answer.
 *
 * WITHOUT IT, the elevation is cleaned anyway, from its own shape
 * (src/core/coastArtefacts.ts): below 0 drawn at 0, the invented wedge off a
 * beach drawn at sea level, isolated spikes brought down. At Virginia Beach on
 * 26 Oct no Overpass server answered and the cliffs came back; the
 * coastline makes the result better, it is never required.
 */
import type { LatLon, Position } from '../core/geo.ts'
import { metresPerPixel, SHORE_MAX_M } from '../core/coastArtefacts.ts'
import { cleanTerrainRgba, decode, encode, terrariumTileOf, tileBox, tilePointLonLat, type SeaBox, type TileAddress } from '../core/seaTile.ts'
import type { CoastJob } from './coastWorker.ts'

/** The box tiles are cleaned in, and the larger box the coastline is fetched for so the nearest way is always in it. */
export const SEA_CLEAN_METERS = 3000
export const SEA_FETCH_METERS = 4500
const SAVED_KEY = 'scoutngo.coastline.v1'
const SAVED_LIMIT = 4

export interface SeaMask {
  box: SeaBox
  coastlines: Position[][]
}

let current: SeaMask | null = null
let version = 0
export type SeaStatus = 'none' | 'loading' | 'ready' | 'failed'
let status: SeaStatus = 'none'
export const seaStatus = (): SeaStatus => status
const listeners = new Set<(version: number) => void>()

export function setSeaMask(mask: SeaMask | null, next: SeaStatus = mask === null ? 'none' : 'ready'): void {
  current = mask
  status = next
  version += 1
  cleaned.clear()
  for (const listener of listeners) listener(version)
}

export const seaMask = (): SeaMask | null => current

/* With ?probe=1, which coastline the elevation was cleaned against is on window.__probe.sea, for scripts/measure-terrain-coast.mjs. */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('probe') === '1') {
  const w = window as unknown as { __probe?: Record<string, unknown> }
  w.__probe = { ...(w.__probe ?? {}), sea: seaStatus, seaTiles: () => ({ ...cleanedBy }), seaMaskNow: () => current }
}
/* How many tiles each way has cleaned: against the coastline, or from the elevation's own shape. */
const cleanedBy = { coastline: 0, shape: 0 }
export const seaMaskVersion = (): number => version

export function onSeaMask(listener: (version: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/* ---------------------------------------------------- the saved coastline */

export const coastKeyFor = (at: LatLon): string => `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`

export function readSavedCoastline(key: string): Position[][] | null {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as { key: string; coastlines: Position[][] }[]
    return Array.isArray(list) ? (list.find((e) => e.key === key)?.coastlines ?? null) : null
  } catch {
    return null
  }
}

export function saveCoastline(key: string, coastlines: Position[][]): void {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as { key: string; coastlines: Position[][] }[]
    const next = [{ key, coastlines }, ...(Array.isArray(list) ? list.filter((e) => e.key !== key) : [])].slice(0, SAVED_LIMIT)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    /* Storage full or refused: the mask still works for this session. */
  }
}

export function parseCoastlines(payload: unknown): Position[][] {
  const elements = (payload as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elements)) return []
  const out: Position[][] = []
  for (const e of elements as { type?: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[]) {
    if (e.type !== 'way' || e.tags?.natural !== 'coastline' || !Array.isArray(e.geometry) || e.geometry.length < 2) continue
    /* In the way's own order: the side the sea is on depends on it. */
    out.push(e.geometry.map((p) => [p.lon, p.lat] as Position))
  }
  return out
}

/* --------------------------------------------------------- the cleaning */

/** A neighbouring tile's raw bytes, or null when it cannot be had. Supplied by the tile loader. */
export type RawTileLoader = (url: string) => Promise<ArrayBuffer | null>

/* One promise per tile URL, per mask: the map and the 3D view ask for the same tiles, and the neighbours overlap. */
const cleaned = new Map<string, Promise<ArrayBuffer>>()
const CLEANED_KEPT = 128

/**
 * A terrain tile's bytes with the sea at sea level. Against the coastline
 * when the tile is inside the box it was fetched for; otherwise from the
 * elevation's own shape, reading the tile's neighbours through `neighbour`
 * (none given: the tile alone). Decoded and re-encoded as PNG with no colour
 * conversion, so the packed heights survive exactly. Bytes that need no
 * change come back as they were.
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
  const mask = current
  const t = tileBox(tile)
  const inMask =
    mask !== null && mask.coastlines.length > 0 && t.west < mask.box.east && t.east > mask.box.west && t.south < mask.box.north && t.north > mask.box.south
  const image = await decodePng(bytes)
  if (image === null) return bytes
  const size = image.width

  if (inMask) {
    cleanedBy.coastline += 1
    if (cleanTerrainRgba(image.data, size, tile, mask.coastlines, mask.box) === 0) return bytes
    return encodePng(image)
  }

  /* No coastline for here. A tile with no ground at sea level has no shore and no sea in it: as it came. */
  const heights = new Float32Array(size * size)
  let lowest = Infinity
  for (let i = 0; i < size * size; i += 1) {
    heights[i] = decode(image.data, i)
    if (heights[i] < lowest) lowest = heights[i]
  }
  if (lowest > SHORE_MAX_M) return bytes
  cleanedBy.shape += 1

  const tiles: (Float32Array | null)[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) tiles.push(heights)
      else tiles.push(neighbour === undefined ? null : await neighbourHeights(url, tile, dx, dy, size, neighbour))
    }
  }
  const lat = tilePointLonLat(tile, 0.5, 0.5).lat
  const out = await runCoastJob({ id: 0, tiles, size, metresPerPixel: metresPerPixel(lat, tile.z, size) })
  if (out.changed === 0) return bytes
  for (let i = 0; i < size * size; i += 1) encode(image.data, i, out.heights[i])
  return encodePng(image)
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

async function decodePng(bytes: ArrayBuffer): Promise<ImageData | null> {
  const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return null
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

async function encodePng(image: ImageData): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context')
  ctx.putImageData(image, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return blob.arrayBuffer()
}

/*
 * THE MAP PICTURE, ON THE DEVICE.
 *
 * WHY THIS EXISTS. ScoutNGo was unusable in Shenandoah with no service. The
 * geometry needed no network and still did not draw, and the imagery and the
 * elevation were simply not there. This file is how the picture comes with
 * you: tiles are kept in Cache Storage, keyed by their real URL, and the map
 * asks for them through a MapLibre protocol that looks here first.
 *
 * WHY addProtocol AND NOT THE SERVICE WORKER. The app's one worker
 * (src/sw/sw.ts) keeps the app shell and passes every other origin through;
 * tiles are not its business and are never duplicated into its cache. This
 * caches DATA only, map tiles, and only the map reads it. transformRequest
 * could not do this: it is synchronous and cannot read a store. A protocol
 * handler is async.
 *
 * FAIL FAST, NEVER HANG. A dead cell does not refuse a request, it sends it
 * and never answers. The map used to build its overlays on MapLibre's `load`,
 * which waits for every tile in view to settle, so on a mountain the cones and
 * the sun ray waited for tiles that were never coming. Measured by
 * scripts/audit-offline.mjs in "hang" mode. Every tile here is answered from
 * the cache, or fetched under a timeout, or refused at once when the device
 * says it is offline.
 *
 * NOTHING HERE IS SENT ANYWHERE NEW. The tiles were always fetched from Esri
 * and AWS by the map, and the buildings and the sea from OpenFreeMap's map
 * tiles (src/lib/vectorTiles.ts); this fetches the same URLs, for a box
 * around the venue, ahead of time.
 */

import type { LatLon } from '../core/geo.ts'
import {
  IMAGERY_TEMPLATE,
  IMAGERY_ZOOMS,
  TERRAIN_TEMPLATE,
  TERRAIN_ZOOMS,
  VECTOR_TEMPLATE,
  vectorZoomsFor,
} from './offlineSources.ts'
import { cleanTerrainBytes } from './seaMask.ts'
import { boxAround, tilesForRange, tileUrl, type Box } from './tileRange.ts'

export const TILE_CACHE = 'scoutngo-tiles-v1'
export const AREAS_STORAGE_KEY = 'scoutngo.offline.areas.v1'

/** The scheme the map's tile URLs carry so they come through loadTile. */
export const PROTOCOL = 'scoutngo'

/**
 * How long one tile may take before it is given up on.
 *
 * Long enough for a slow but working connection to answer a 20 KB tile, short
 * enough that a dead one costs seconds rather than the browser's own timeout,
 * which is minutes.
 */
export const TILE_TIMEOUT_MS = 8000

/*
 * THE DEFAULT RING: 2.34 MB at Big Meadow, 400 m radius, MEASURED in
 * measurements/2026-10-25-venue-cache-400m.md.
 */
/*
 * THE LARGEST RING: 29.61 MB at Big Meadow, 2000 m radius, MEASURED in
 * measurements/2026-10-25-venue-cache-2000m.md.
 */
/**
 * The size above which the automatic venue cache leaves out its top zoom.
 *
 * THE BRIEF'S CEILING. No radius the ring allows reaches it today (the two
 * measurements above). It is enforced anyway, because imagery density is a
 * property of the place and a city at the largest ring is not Big Meadow.
 */
export const AUTO_CACHE_CEILING_BYTES = 40_000_000

/**
 * What one terrain tile weighs, for a size shown before download.
 *
 * AN ESTIMATE, AND THE SCREEN SAYS SO. Esri answers a cross-origin HEAD, so
 * imagery is measured before anything is downloaded. The terrain bucket's
 * CORS rule allows GET only, so a browser cannot HEAD a terrain tile. Its
 * share is this mean times the count: 72559 bytes over 68 tiles, MEASURED in
 * measurements/2026-10-25-venue-cache-2000m.md.
 */
export const TERRAIN_TILE_MEAN_BYTES = 72559

/**
 * What one OpenFreeMap vector tile weighs, for the same reason: its server
 * answers HEAD with no length. 28286 bytes over 28 tiles at Big Meadow and
 * Virginia Beach Fishing Pier, MEASURED in measurements/2026-10-27-vector-tiles.md.
 * A beach town's tiles run heavier than forest's, which is why it is said as
 * an estimate.
 */
export const VECTOR_TILE_MEAN_BYTES = 28286

/** Automatic venue areas kept before the oldest is dropped. Trips are never dropped. */
export const AUTO_AREAS_KEPT = 5

/* ------------------------------------------------------------ protocol URLs */

/** https://host/path becomes scoutngo://host/path. */
export const viaProtocol = (template: string): string =>
  template.replace(/^https:\/\//, `${PROTOCOL}://`)

/** And back. Anything not carrying the scheme is returned unchanged. */
export const realUrl = (url: string): string =>
  url.startsWith(`${PROTOCOL}://`) ? `https://${url.slice(PROTOCOL.length + 3)}` : url

/* ------------------------------------------------------------- connectivity */

/*
 * IS THERE A NETWORK? The venue bar's quiet mark reads this.
 *
 * navigator.onLine alone cannot answer it. It is false in airplane mode and
 * TRUE on a mountain with the radio on and no bars, which is the case that
 * actually happened. So the answer is also what the network has DONE lately:
 * a request that timed out or failed with the device claiming to be online
 * marks it unreachable, and the next one that succeeds clears that.
 */
type Listener = (online: boolean) => void
const listeners = new Set<Listener>()
let lastAttemptFailed = false

const deviceOnline = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine !== false

export function isOnline(): boolean {
  return deviceOnline() && !lastAttemptFailed
}

/** Every network call that can tell success from failure reports it here. */
export function reportNetwork(ok: boolean): void {
  const before = isOnline()
  lastAttemptFailed = !ok
  const after = isOnline()
  if (before !== after) for (const listener of listeners) listener(after)
}

export function onConnectivity(listener: Listener): () => void {
  listeners.add(listener)
  const relay = () => listener(isOnline())
  if (typeof window !== 'undefined') {
    window.addEventListener('online', relay)
    window.addEventListener('offline', relay)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', relay)
      window.removeEventListener('offline', relay)
    }
  }
}

/** For tests: forget what the network did. */
export function resetConnectivity(): void {
  lastAttemptFailed = false
}

/* ------------------------------------------------------------------ storage */

/*
 * Cache Storage, when this browser has it. It does not exist on an insecure
 * origin, and a test environment has none; both mean "nothing saved", never a
 * throw on the map's render path.
 */
const tileCache = async (): Promise<Cache | null> => {
  try {
    if (typeof caches === 'undefined') return null
    return await caches.open(TILE_CACHE)
  } catch {
    return null
  }
}

/** A saved tile's bytes, or null. */
export async function readSaved(url: string): Promise<ArrayBuffer | null> {
  const cache = await tileCache()
  if (cache === null) return null
  try {
    const hit = await cache.match(url)
    return hit === undefined ? null : await hit.arrayBuffer()
  } catch {
    return null
  }
}

/** Fetch under a timeout that also honours the caller's own abort. */
async function fetchWithin(
  url: string,
  ms: number,
  outer?: AbortSignal,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const relay = () => controller.abort()
  /*
   * ALREADY CANCELLED COUNTS. The map can drop a tile while the saved copy is
   * still being looked up; a listener added after that abort never fires, and
   * the request would sit out the whole timeout for a tile nobody wants.
   */
  if (outer?.aborted === true) controller.abort()
  outer?.addEventListener('abort', relay)
  try {
    return await fetch(url, { method, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', relay)
  }
}

/**
 * A tile's bytes as they were saved or served, nothing done to them, or null
 * when they cannot be had: the neighbours the elevation cleanup reads around
 * a coastal tile (src/lib/seaMask.ts).
 */
export async function loadRawTile(url: string): Promise<ArrayBuffer | null> {
  const saved = await readSaved(url)
  if (saved !== null) return saved
  /* Not while the last request timed out or failed: a side read must not sit out a dead network's timeout. */
  if (!isOnline()) return null
  try {
    const response = await fetchWithin(url, TILE_TIMEOUT_MS)
    return response.ok ? await response.arrayBuffer() : null
  } catch {
    return null
  }
}

/**
 * THE MAP'S TILE LOADER, registered as the scoutngo:// protocol.
 *
 * Saved first, network second, and a refusal at once when the device says it
 * is offline. A tile it cannot supply is an error to MapLibre, which marks it
 * errored and carries on: a blank square, never a wait.
 */
export async function loadTile(
  params: { url: string },
  abort: AbortController,
): Promise<{ data: ArrayBuffer }> {
  const url = realUrl(params.url)
  const saved = await readSaved(url)
  /* Elevation tiles have the sea put at sea level first (src/lib/seaMask.ts), for 2D and 3D alike. */
  if (saved !== null) return { data: await cleanTerrainBytes(url, saved, loadRawTile) }

  if (!deviceOnline()) throw new Error(`offline and not saved: ${url}`)

  let response: Response
  try {
    response = await fetchWithin(url, TILE_TIMEOUT_MS, abort.signal)
  } catch (error) {
    /* The map cancelling a tile it scrolled past says nothing about the network. */
    if (!abort.signal.aborted) reportNetwork(false)
    throw error
  }
  reportNetwork(true)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return { data: await cleanTerrainBytes(url, await response.arrayBuffer(), loadRawTile) }
}

/* -------------------------------------------------------------------- areas */

/** venue: the automatic ring. trip: taken by hand. 3d: the coarse tiles over a venue the 3D overview needs. */
export type AreaKind = 'venue' | 'trip' | '3d'

/** One saved area, as the list shows it and as deletion recomputes it. */
export interface SavedArea {
  id: string
  kind: AreaKind
  /** What it is called on screen: the venue name, or "Around <venue>". */
  label: string
  box: Box
  imageryZooms: [number, number]
  terrainZooms: [number, number]
  /** Tiles actually stored. */
  tiles: number
  /** Bytes actually stored, summed from the bodies, not estimated. */
  bytes: number
  /** ISO instant. */
  savedAt: string
  /** Set when the top zoom was left out to stay under the ceiling. */
  note?: string
}

/**
 * The URLs an area covers: imagery, terrain, and the map tiles its buildings
 * and its sea come from, at the zooms its terrain is cleaned against
 * (vectorZoomsFor), so the area works with no signal.
 */
export function areaUrls(
  box: Box,
  imageryZooms: readonly [number, number] = IMAGERY_ZOOMS,
  terrainZooms: readonly [number, number] = TERRAIN_ZOOMS,
): { imagery: string[]; terrain: string[]; vector: string[] } {
  const vectorZooms = vectorZoomsFor(terrainZooms)
  return {
    imagery: tilesForRange(box, imageryZooms[0], imageryZooms[1]).map((t) =>
      tileUrl(IMAGERY_TEMPLATE, t),
    ),
    terrain: tilesForRange(box, terrainZooms[0], terrainZooms[1]).map((t) =>
      tileUrl(TERRAIN_TEMPLATE, t),
    ),
    vector:
      vectorZooms === null
        ? []
        : tilesForRange(box, vectorZooms[0], vectorZooms[1]).map((t) => tileUrl(VECTOR_TEMPLATE, t)),
  }
}

/** The box the automatic cache covers: the venue's own ring. */
export const venueBox = (centre: LatLon, radiusMeters: number): Box =>
  boxAround(centre, radiusMeters)

const isBox = (value: unknown): value is Box => {
  const b = value as Partial<Box> | null
  return (
    typeof b === 'object' &&
    b !== null &&
    [b.south, b.west, b.north, b.east].every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

const isZooms = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n))

/** Anything unreadable is dropped, never thrown. */
export function reviveAreas(raw: unknown): SavedArea[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((a): a is SavedArea => {
    const area = a as Partial<SavedArea> | null
    return (
      typeof area?.id === 'string' &&
      (area.kind === 'venue' || area.kind === 'trip' || area.kind === '3d') &&
      typeof area.label === 'string' &&
      isBox(area.box) &&
      isZooms(area.imageryZooms) &&
      isZooms(area.terrainZooms) &&
      typeof area.tiles === 'number' &&
      typeof area.bytes === 'number' &&
      typeof area.savedAt === 'string'
    )
  })
}

export function loadAreas(): SavedArea[] {
  try {
    const raw = localStorage.getItem(AREAS_STORAGE_KEY)
    return raw === null ? [] : reviveAreas(JSON.parse(raw))
  } catch {
    return []
  }
}

const areaListeners = new Set<() => void>()

/** The list of saved areas changed: one was saved, deleted or dropped. */
export function onAreasChanged(listener: () => void): () => void {
  areaListeners.add(listener)
  return () => areaListeners.delete(listener)
}

function saveAreas(areas: SavedArea[]): void {
  try {
    localStorage.setItem(AREAS_STORAGE_KEY, JSON.stringify(areas))
  } catch {
    /* The tiles are saved either way; only the list of them could not be. */
  }
  for (const listener of areaListeners) listener()
}

/** Two boxes describe the same ground, to about a metre. */
export const sameBox = (a: Box, b: Box): boolean =>
  [a.south - b.south, a.west - b.west, a.north - b.north, a.east - b.east].every(
    (d) => Math.abs(d) < 1e-5,
  )

const allUrls = (area: Pick<SavedArea, 'box' | 'imageryZooms' | 'terrainZooms'>): string[] => {
  const urls = areaUrls(area.box, area.imageryZooms, area.terrainZooms)
  return [...urls.imagery, ...urls.terrain, ...urls.vector]
}

/**
 * The URLs that deleting this area would actually free.
 *
 * Two areas overlap whenever a trip includes the venue, and a tile both of
 * them hold must survive deleting one. So a tile goes only when no OTHER
 * saved area still covers it.
 */
export function urlsFreedBy(target: SavedArea, areas: SavedArea[]): string[] {
  const kept = new Set(areas.filter((a) => a.id !== target.id).flatMap(allUrls))
  return allUrls(target).filter((url) => !kept.has(url))
}

export async function deleteArea(id: string): Promise<SavedArea[]> {
  const areas = loadAreas()
  const target = areas.find((a) => a.id === id)
  if (target === undefined) return areas
  const cache = await tileCache()
  if (cache !== null) {
    await Promise.all(urlsFreedBy(target, areas).map((url) => cache.delete(url).catch(() => false)))
  }
  const left = areas.filter((a) => a.id !== id)
  saveAreas(left)
  return left
}

/* ---------------------------------------------------------------- measuring */

export interface AreaSize {
  /** Tiles not already on the device. */
  imageryTiles: number
  terrainTiles: number
  /** Measured with HEAD. Null when any imagery tile could not be measured. */
  imageryBytes: number | null
  /** Count times TERRAIN_TILE_MEAN_BYTES. Labelled as an estimate. */
  terrainBytesEstimate: number
  /** The map tiles for buildings and the sea, not already on the device. */
  vectorTiles: number
  /** Count times VECTOR_TILE_MEAN_BYTES. Labelled as an estimate. */
  vectorBytesEstimate: number
  /** Tiles already saved by another area, which cost nothing more. */
  alreadySaved: number
}

/** Runs one async job per item, a few at a time, stopping on abort. */
async function pool<T>(
  items: T[],
  width: number,
  job: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(width, queue.length) }, async () => {
      while (queue.length > 0) {
        if (signal?.aborted === true) return
        const next = queue.shift() as T
        await job(next)
      }
    }),
  )
}

async function savedSet(urls: string[]): Promise<Set<string>> {
  const cache = await tileCache()
  const out = new Set<string>()
  if (cache === null) return out
  await pool(urls, 8, async (url) => {
    if ((await cache.match(url).catch(() => undefined)) !== undefined) out.add(url)
  })
  return out
}

/**
 * THE SIZE, BEFORE A SINGLE TILE IS DOWNLOADED.
 *
 * Imagery by HEAD: Esri answers it with a Content-Length, so the number is a
 * measurement of these tiles and not an average. Terrain as an estimate, for
 * the reason on TERRAIN_TILE_MEAN_BYTES. Tiles already on the device are
 * counted apart and cost nothing.
 */
export async function measureArea(
  box: Box,
  imageryZooms: readonly [number, number],
  terrainZooms: readonly [number, number],
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<AreaSize> {
  const urls = areaUrls(box, imageryZooms, terrainZooms)
  const saved = await savedSet([...urls.imagery, ...urls.terrain, ...urls.vector])
  const imagery = urls.imagery.filter((u) => !saved.has(u))
  const terrain = urls.terrain.filter((u) => !saved.has(u))
  const vector = urls.vector.filter((u) => !saved.has(u))

  let imageryBytes: number | null = 0
  let done = 0
  await pool(
    imagery,
    6,
    async (url) => {
      try {
        /* HEAD: the size without the body. Measuring must not be downloading. */
        const response = await fetchWithin(url, TILE_TIMEOUT_MS, signal, 'HEAD')
        const length = Number(response.headers.get('content-length'))
        if (!response.ok && response.status !== 404) imageryBytes = null
        else if (imageryBytes !== null) imageryBytes += Number.isFinite(length) ? length : 0
        reportNetwork(true)
      } catch {
        imageryBytes = null
        if (signal?.aborted !== true) reportNetwork(false)
      }
      done += 1
      onProgress?.(done, imagery.length)
    },
    signal,
  )

  return {
    imageryTiles: imagery.length,
    terrainTiles: terrain.length,
    imageryBytes,
    terrainBytesEstimate: terrain.length * TERRAIN_TILE_MEAN_BYTES,
    vectorTiles: vector.length,
    vectorBytesEstimate: vector.length * VECTOR_TILE_MEAN_BYTES,
    alreadySaved: saved.size,
  }
}

/* ----------------------------------------------------------- downloading */

export type DownloadResult =
  | { status: 'ok'; area: SavedArea }
  | { status: 'cancelled'; stored: number }
  | { status: 'error'; reason: string; stored: number }

/**
 * Downloads every tile of an area that is not already saved, and records it.
 *
 * Bytes are summed from the bodies actually stored, so the list shows what is
 * on the device rather than what was promised. A cancel keeps what arrived:
 * a half-saved venue is more use offline than none, and the list says it is
 * not complete by not listing it.
 */
export async function downloadArea(
  spec: Omit<SavedArea, 'id' | 'tiles' | 'bytes' | 'savedAt'>,
  signal: AbortSignal,
  onProgress?: (done: number, total: number, bytes: number) => void,
): Promise<DownloadResult> {
  const cache = await tileCache()
  if (cache === null) {
    return { status: 'error', reason: 'This browser has no storage for map tiles.', stored: 0 }
  }
  const urls = allUrls(spec)
  const saved = await savedSet(urls)
  const missing = urls.filter((u) => !saved.has(u))

  let bytes = 0
  let done = 0
  let failed = 0
  let quota = false
  await pool(
    missing,
    6,
    async (url) => {
      try {
        const response = await fetchWithin(url, TILE_TIMEOUT_MS * 2, signal)
        reportNetwork(true)
        if (response.ok) {
          const body = await response.arrayBuffer()
          await cache.put(
            url,
            new Response(body, { headers: { 'content-type': response.headers.get('content-type') ?? '' } }),
          )
          bytes += body.byteLength
        } else if (response.status !== 404) {
          failed += 1
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') quota = true
        else if (signal.aborted !== true) {
          failed += 1
          reportNetwork(false)
        }
      }
      done += 1
      onProgress?.(done, missing.length, bytes)
    },
    signal,
  )

  if (signal.aborted) return { status: 'cancelled', stored: done }
  if (quota) {
    return { status: 'error', reason: 'The browser ran out of storage partway through.', stored: done }
  }
  if (failed > 0) {
    return {
      status: 'error',
      reason: `${failed} of ${missing.length} tiles did not arrive. Try again with a better signal.`,
      stored: done,
    }
  }

  /* What the area holds now, including tiles another area had already saved. */
  const alreadyBytes = await savedBytes(urls.filter((u) => saved.has(u)))
  const area: SavedArea = {
    ...spec,
    id: `${spec.kind}-${Date.now().toString(36)}`,
    tiles: urls.length,
    bytes: bytes + alreadyBytes,
    savedAt: new Date().toISOString(),
  }

  const areas = loadAreas()
  const next = [area, ...areas]
  /* Old automatic venues and 3D overviews go first, each kept to its own count; a trip is only ever deleted by hand. */
  const dropped = [
    ...next.filter((a) => a.kind === 'venue').slice(AUTO_AREAS_KEPT),
    ...next.filter((a) => a.kind === '3d').slice(AUTO_AREAS_KEPT),
  ]
  for (const old of dropped) {
    const freed = urlsFreedBy(old, next)
    await Promise.all(freed.map((url) => cache.delete(url).catch(() => false)))
  }
  saveAreas(next.filter((a) => !dropped.some((d) => d.id === a.id)))
  void requestPersistence()
  return { status: 'ok', area }
}

async function savedBytes(urls: string[]): Promise<number> {
  const cache = await tileCache()
  if (cache === null) return 0
  let total = 0
  await pool(urls, 8, async (url) => {
    const hit = await cache.match(url).catch(() => undefined)
    if (hit !== undefined) total += (await hit.arrayBuffer()).byteLength
  })
  return total
}

/**
 * Asks the browser not to evict saved tiles under storage pressure.
 *
 * A request, not a guarantee, and Safari decides for itself. Asked once a
 * tile has actually been saved, never on load.
 */
async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* Declined or unsupported. The tiles are still saved. */
  }
}

/* --------------------------------------------------------------- formatting */

/** Megabytes to one decimal, the way the area list and the measure line read. */
export function formatBytes(bytes: number): string {
  if (bytes < 100_000) return `${Math.max(0.1, bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** Imagery measured plus terrain estimated, or null when imagery could not be measured. */
export const totalBytes = (size: AreaSize): number | null =>
  size.imageryBytes === null ? null : size.imageryBytes + estimatedBytes(size)

/** The share that is an estimate: terrain and map tiles, a count times a measured mean. */
const estimatedBytes = (size: AreaSize): number => size.terrainBytesEstimate + size.vectorBytesEstimate

/** Every tile an area still needs. */
export const tilesToFetch = (size: AreaSize): number => size.imageryTiles + size.terrainTiles + size.vectorTiles

/** The size line shown before a download, saying which half is measured. */
export function sizeLine(size: AreaSize): string {
  const estimate = estimatedBytes(size)
  if (tilesToFetch(size) === 0) return 'Already saved on this device.'
  if (size.imageryBytes === null) {
    return `${tilesToFetch(size)} tiles. The size could not be measured with this signal.`
  }
  const total = size.imageryBytes + estimate
  const line =
    estimate === 0
      ? `${formatBytes(total)}, measured`
      : `${formatBytes(total)} · imagery measured, terrain and map data estimated`
  /*
   * WHAT IS ALREADY HERE COSTS NOTHING, and is said, or the saved list -- which
   * counts every tile an area holds -- reads as a different, larger number.
   */
  return size.alreadySaved === 0
    ? line
    : `${line} · ${size.alreadySaved} tiles already on this phone`
}

/** Whether a measured size fits under the automatic cache's ceiling. */
export const fitsCeiling = (size: AreaSize): boolean =>
  size.imageryBytes !== null &&
  size.imageryBytes + estimatedBytes(size) <= AUTO_CACHE_CEILING_BYTES

/** Past this many imagery tiles a view is too wide to measure tile by tile. */
export const MAX_TRIP_TILES = 4000

/*
 * THE VENUE IS NAMED ONCE ON THE SCREEN, in the venue bar. An area saved for
 * the venue on screen is "this venue" here; areas for other venues keep their
 * names, because that is the only way to tell them apart.
 */
export function areaLabel(label: string, venueName: string): string {
  if (venueName === '' || !label.includes(venueName)) return label
  if (label === venueName || label.startsWith(`${venueName},`)) return 'This venue'
  return label.replace(venueName, 'this venue')
}

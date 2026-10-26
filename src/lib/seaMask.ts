/*
 * THE COASTLINE THE ELEVATION IS CLEANED AGAINST (src/core/seaTile.ts).
 *
 * One mask at a time, for the venue on screen: the coastline ways around it
 * from OpenStreetMap, through the same Overpass the rest of the app uses, and
 * kept on the phone so a coast looked at once is still at sea level with no
 * signal. Every terrain tile both the 2D map and the 3D model read comes
 * through loadTile (offlineCache.ts), which hands it here first, so the two
 * views cannot disagree about where the sea is.
 *
 * A venue with no coastline near it has an empty mask and every tile passes
 * through untouched.
 */
import type { LatLon, Position } from '../core/geo.ts'
import { cleanTerrainRgba, terrariumTileOf, tileBox, type SeaBox } from '../core/seaTile.ts'
import { OVERPASS_URL } from './overpass.ts'
import { boxAround } from './tileRange.ts'

/** The box tiles are cleaned in, and the larger box the coastline is fetched for so the nearest way is always in it. */
export const SEA_CLEAN_METERS = 3000
export const SEA_FETCH_METERS = 4500
const SAVED_KEY = 'scoutngo.coastline.v1'
const SAVED_LIMIT = 4
/* Overpass took 37 s for the Virginia Beach coastline, after a 502: wait, and try again. */
const TIMEOUT_MS = 60_000
const ATTEMPTS = 3
const RETRY_GAP_MS = 6_000

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
  for (const listener of listeners) listener(version)
}

export const seaMask = (): SeaMask | null => current
export const seaMaskVersion = (): number => version

export function onSeaMask(listener: (version: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/* ------------------------------------------------------------- the fetch */

const keyFor = (at: LatLon) => `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`

function readSaved(key: string): Position[][] | null {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as { key: string; coastlines: Position[][] }[]
    return Array.isArray(list) ? (list.find((e) => e.key === key)?.coastlines ?? null) : null
  } catch {
    return null
  }
}

function save(key: string, coastlines: Position[][]): void {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as { key: string; coastlines: Position[][] }[]
    const next = [{ key, coastlines }, ...(Array.isArray(list) ? list.filter((e) => e.key !== key) : [])].slice(0, SAVED_LIMIT)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  } catch {
    /* Storage full or refused: the mask still works for this session. */
  }
}

export function coastlineQuery(box: SeaBox): string {
  return `[out:json][timeout:20];way["natural"="coastline"](${box.south},${box.west},${box.north},${box.east});out geom;`
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

/**
 * The coastline around a venue: the saved copy when there is one (coastlines
 * do not move), else Overpass. Sets the mask either way; an empty mask when
 * neither answers, which leaves the elevation as it came.
 */
export async function loadSeaMask(venue: LatLon, fetcher: typeof fetch = fetch, gapMs = RETRY_GAP_MS): Promise<'saved' | 'fetched' | 'none'> {
  const key = keyFor(venue)
  const box = boxAround(venue, SEA_CLEAN_METERS)
  const saved = readSaved(key)
  if (saved !== null) {
    setSeaMask({ box, coastlines: saved })
    return 'saved'
  }
  setSeaMask(null, 'loading')
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, gapMs))
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      const res = await fetcher(OVERPASS_URL, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: coastlineQuery(boxAround(venue, SEA_FETCH_METERS)),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const coastlines = parseCoastlines(await res.json())
      save(key, coastlines)
      setSeaMask({ box, coastlines })
      return 'fetched'
    } catch {
      continue
    }
  }
  setSeaMask(null, 'failed')
  return 'none'
}

/* --------------------------------------------------------- the cleaning */

/**
 * A terrain tile's bytes with the sea at sea level and the shore band no
 * higher than the land behind it, or the same bytes
 * when there is no mask, the URL is not a terrain tile, or the tile does not
 * touch the coast. Decoded and re-encoded as PNG with no colour conversion,
 * so the packed heights survive exactly.
 */
export async function cleanTerrainBytes(url: string, bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const mask = current
  const tile = terrariumTileOf(url)
  if (mask === null || mask.coastlines.length === 0 || tile === null) return bytes
  const t = tileBox(tile)
  if (!(t.west < mask.box.east && t.east > mask.box.west && t.south < mask.box.north && t.north > mask.box.south)) return bytes
  const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const size = bitmap.width
  const canvas = new OffscreenCanvas(size, bitmap.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return bytes
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = ctx.getImageData(0, 0, size, size)
  if (cleanTerrainRgba(image.data, size, tile, mask.coastlines, mask.box) === 0) return bytes
  ctx.putImageData(image, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return blob.arrayBuffer()
}

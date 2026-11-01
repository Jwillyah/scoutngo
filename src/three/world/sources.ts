/*
 * WHERE THE NEW 3D SCENE'S GROUND COMES FROM (Batch D): the local frame, the
 * tile arithmetic, the elevation read from the PNG's bytes, and the imagery
 * through the 2D map's own tile cache. No canvas readback anywhere: WebKit
 * adds noise to pixels read back from a canvas (src/lib/png.ts).
 *
 * THE FRAME. Metres round the venue: x east, y up, z south (three.js looks
 * down -z, so north is -z). Within the few kilometres the scene draws, an
 * equirectangular frame on the venue is within centimetres of the real
 * ground; tile corners are placed by their own latitude, so Web Mercator
 * tiles land where they belong.
 */
import type { LatLon } from '../../core/geo.ts'
import { decodePng } from '../../lib/png.ts'
import { loadTile } from '../../lib/offlineCache.ts'
import { IMAGERY_TEMPLATE, TERRAIN_TEMPLATE } from '../../lib/offlineSources.ts'
import { covers, pickImagery, sourceTileUrl, type ImagerySource } from '../../data/imagerySources.ts'
import { tileUrl } from '../../lib/tileRange.ts'

export const ESRI_CREDIT = 'Tiles by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
export const TERRAIN_CREDIT = 'Elevation: Terrarium, AWS Open Data'
export const OSM_CREDIT = 'Buildings and water: OpenStreetMap contributors, via OpenFreeMap'
/* The deepest elevation the source has. */
export const TERRAIN_MAX_Z = 15

export interface Frame {
  venue: LatLon
  mLat: number
  mLon: number
  x(lon: number): number
  z(lat: number): number
  lon(x: number): number
  lat(z: number): number
}

export function frameAt(venue: LatLon): Frame {
  const mLat = 111_132.954 - 559.822 * Math.cos((2 * venue.lat * Math.PI) / 180)
  const mLon = (Math.PI / 180) * 6_378_137 * Math.cos((venue.lat * Math.PI) / 180)
  return {
    venue,
    mLat,
    mLon,
    x: (lon) => (lon - venue.lon) * mLon,
    z: (lat) => -(lat - venue.lat) * mLat,
    lon: (x) => venue.lon + x / mLon,
    lat: (z) => venue.lat - z / mLat,
  }
}

/* ---------------------------------------------------------------- tiles */

export const tileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
export const tileY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z
}
export const lonOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180
export const latOf = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

/* ----------------------------------------------------- what is in flight */

/** Requests not yet answered, and pieces still being built from them: the scene is settled when this is 0 (the audits' "loaded"). */
export const pending = { n: 0 }
/** Count a piece of work (a ring tile, a water tile) as pending until it settles. */
export async function working<T>(job: () => Promise<T>): Promise<T> {
  pending.n += 1
  try {
    return await job()
  } finally {
    pending.n -= 1
  }
}
/** How many tiles the scene has drawn from, for the network audit's "did it look at all". */
export const tileCounts = { imagery: 0, terrain: 0 }

async function bytes(url: string): Promise<ArrayBuffer> {
  pending.n += 1
  try {
    const { data } = await loadTile({ url }, new AbortController())
    return data
  } finally {
    pending.n -= 1
  }
}

/* -------------------------------------------------------------- terrain */

interface Heights {
  size: number
  h: Float32Array
}
const terrainCache = new Map<string, Promise<Heights | null>>()

/** One terrarium tile's heights in metres, or null where it cannot be had (offline and not saved). */
export function terrainTile(x: number, y: number, z: number): Promise<Heights | null> {
  const key = `${z}/${x}/${y}`
  let hit = terrainCache.get(key)
  if (hit === undefined) {
    hit = bytes(tileUrl(TERRAIN_TEMPLATE, { x, y, z }))
      .then(async (b) => {
        const png = await decodePng(b)
        const h = new Float32Array(png.width * png.height)
        for (let i = 0; i < h.length; i += 1) h[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768
        tileCounts.terrain += 1
        return { size: png.width, h }
      })
      .catch(() => null)
    terrainCache.set(key, hit)
    if (terrainCache.size > 160) terrainCache.delete(terrainCache.keys().next().value as string)
  }
  return hit
}

/** Bilinear height at a place from a decoded tile; null when the tile is not there. */
export function sampleTile(t: Heights, x: number, y: number, z: number, lat: number, lon: number): number {
  const fx = (tileX(lon, z) - x) * t.size - 0.5
  const fy = (tileY(lat, z) - y) * t.size - 0.5
  const cx = Math.max(0, Math.min(t.size - 1, fx))
  const cy = Math.max(0, Math.min(t.size - 1, fy))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(t.size - 1, x0 + 1)
  const y1 = Math.min(t.size - 1, y0 + 1)
  const ax = cx - x0
  const ay = cy - y0
  const at = (px: number, py: number) => t.h[py * t.size + px]
  return (at(x0, y0) * (1 - ax) + at(x1, y0) * ax) * (1 - ay) + (at(x0, y1) * (1 - ax) + at(x1, y1) * ax) * ay
}

/** The ground's height at a place, at zoom `z` (to TERRAIN_MAX_Z), or null. */
export async function heightAt(lat: number, lon: number, z = TERRAIN_MAX_Z): Promise<number | null> {
  const x = Math.floor(tileX(lon, z))
  const y = Math.floor(tileY(lat, z))
  const t = await terrainTile(x, y, z)
  return t === null ? null : sampleTile(t, x, y, z, lat, lon)
}

/* -------------------------------------------------------------- imagery */

export interface Picture {
  image: ImageBitmap
  /** The part of `image` that is this tile: the whole, or a parent's quarter. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** The zoom the picture really is. */
  z: number
}

const pictureCache = new Map<string, Promise<ImageBitmap | null>>()
const isPng = (b: ArrayBuffer) => {
  const h = new Uint8Array(b, 0, Math.min(4, b.byteLength))
  return h[0] === 0x89 && h[1] === 0x50
}

/**
 * One imagery tile as a bitmap: the venue's sharpest free source where it
 * covers the tile (src/data/imagerySources.ts), Esri's elsewhere and where
 * it has none, a source's transparent edge laid over Esri's (drawn into a
 * fresh canvas, never read back). Null when it cannot be had.
 */
function picture(x: number, y: number, z: number, source: ImagerySource | null): Promise<ImageBitmap | null> {
  const key = `${source?.id ?? 'esri'}:${z}/${x}/${y}`
  let hit = pictureCache.get(key)
  if (hit === undefined) {
    const esri = () => bytes(tileUrl(IMAGERY_TEMPLATE, { x, y, z })).then((b) => createImageBitmap(new Blob([b])))
    const centre = { lat: latOf(y + 0.5, z), lon: lonOf(x + 0.5, z) }
    const fromSource =
      source === null || z > source.maxZoom || !covers(source, centre)
        ? esri()
        : bytes(sourceTileUrl(source, x, y, z)).then(
            async (b) => {
              const over = await createImageBitmap(new Blob([b]))
              if (!isPng(b)) return over
              const under = await esri().catch(() => null)
              if (under === null) return over
              const c = new OffscreenCanvas(under.width, under.height)
              const ctx = c.getContext('2d')
              if (ctx === null) return over
              ctx.drawImage(under, 0, 0)
              ctx.drawImage(over, 0, 0, under.width, under.height)
              return c.transferToImageBitmap()
            },
            () => esri(),
          )
    hit = fromSource
      .then((img) => {
        tileCounts.imagery += 1
        return img
      })
      .catch(() => null)
    pictureCache.set(key, hit)
    if (pictureCache.size > 600) pictureCache.delete(pictureCache.keys().next().value as string)
  }
  return hit
}

/**
 * The tile's picture, or its nearest ancestor's matching part (up to
 * `climb` levels): offline with only the overview saved (zoom 13) the near
 * ground still wears a picture, and a child never leaves a hole while it
 * loads.
 */
export async function pictureOrParent(x: number, y: number, z: number, source: ImagerySource | null, climb = 6): Promise<Picture | null> {
  for (let d = 0; d <= climb; d += 1) {
    const px = Math.floor(x / 2 ** d)
    const py = Math.floor(y / 2 ** d)
    const img = await picture(px, py, z - d, source)
    if (img !== null) {
      const n = 2 ** d
      const sw = img.width / n
      const sh = img.height / n
      return { image: img, sx: (x - px * n) * sw, sy: (y - py * n) * sh, sw, sh, z: z - d }
    }
  }
  return null
}

/** Only the tile's own picture, no ancestor: for a level drawn over its parent. */
export const pictureOnly = (x: number, y: number, z: number, source: ImagerySource | null) => picture(x, y, z, source)

export const imagerySourceFor = (venue: LatLon) => pickImagery(venue)

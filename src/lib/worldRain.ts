/*
 * RAIN OVER THE WHOLE WORLD (Batch Map, Section 5; board MapChrome). Radar
 * where open radar data exists, a satellite rain estimate everywhere else,
 * from LibreWXR (open source, AGPL-3.0; its public tiles CC-BY-4.0), which
 * merges NOAA MRMS (US), Canada's MSC GeoMet, EUMETNET OPERA (Europe), JMA
 * (Japan), CWA (Taiwan), Malaysia and the Philippines, and fills the gaps
 * with NOAA RRQPE satellite rainfall (60°S to 70°N). docs/data-sources.md
 * has each source's licence.
 *
 * The client speaks the RainViewer v2 tile API (weather-maps.json, then
 * {host}{path}/{size}/{z}/{x}/{y}/{colour}/{smooth}_{snow}.png), so the
 * public server or a copy run by this app work alike: RAIN_HOST is the one
 * line to change. Not RainViewer's own free API (personal use only since
 * 2026, zoom capped at 7, no forecast).
 *
 * The phone sends nothing but which tiles it draws, like any map tile.
 */
export const RAIN_HOST = 'https://api.librewxr.net'
export const RAIN_MAPS = `${RAIN_HOST}/public/weather-maps.json`
/** The colour scheme (RainViewer's numbering; 2 is its "universal blue", light to extreme), smoothed, no snow colours. */
export const RAIN_COLOUR = 2
export const RAIN_OPTIONS = '1_0'
export const RAIN_MAX_ZOOM = 10

export interface RainFrame {
  time: number
  path: string
}

export interface RainMaps {
  host: string
  past: RainFrame[]
  nowcast: RainFrame[]
}

export function parseRainMaps(payload: unknown): RainMaps | null {
  const p = payload as { host?: unknown; radar?: { past?: unknown; nowcast?: unknown } }
  const frames = (x: unknown): RainFrame[] =>
    Array.isArray(x) ? x.flatMap((f: { time?: unknown; path?: unknown }) => (typeof f?.time === 'number' && typeof f?.path === 'string' ? [{ time: f.time, path: f.path }] : [])) : []
  const past = frames(p?.radar?.past)
  if (past.length === 0) return null
  return { host: typeof p.host === 'string' && /^https:\/\//.test(p.host) ? p.host : RAIN_HOST, past, nowcast: frames(p?.radar?.nowcast) }
}

/** The frame for a moment: the nearest past frame, or a nowcast frame when the moment is ahead of the last scan. */
export function frameFor(maps: RainMaps, at: Date): RainFrame {
  const t = at.getTime() / 1000
  const all = [...maps.past, ...maps.nowcast]
  return all.reduce((a, b) => (Math.abs(b.time - t) < Math.abs(a.time - t) ? b : a))
}

/** The tile URL the map asks: through the phone's mask (rainMaskProtocol), which fetches it from LibreWXR. */
export const rainTileUrl = (maps: RainMaps, frame: RainFrame): string => `${maps.host.replace(/^https:\/\//, `${RAIN_PROTOCOL}://`)}${frame.path}/256/{z}/{x}/{y}/${RAIN_COLOUR}/${RAIN_OPTIONS}.png`

let cached: { at: number; maps: RainMaps | null } | null = null
/** The frame list, asked at most every 5 minutes. */
export async function fetchRainMaps(fetchImpl: typeof fetch = fetch): Promise<RainMaps | null> {
  if (cached !== null && Date.now() - cached.at < 5 * 60_000) return cached.maps
  try {
    const r = await fetchImpl(RAIN_MAPS, { signal: AbortSignal.timeout(8000) })
    const maps = r.ok ? parseRainMaps(await r.json()) : null
    cached = { at: Date.now(), maps }
    return maps
  } catch {
    return null
  }
}

/*
 * WHERE THERE IS RADAR. Coarse boxes round the open radar networks LibreWXR
 * merges; outside them the rain is the satellite estimate, and the map
 * hatches it ("hatched = satellite estimate, no radar here"). Boxes, not
 * the networks' exact ranges: the hatching says "estimate" a little early
 * at a coast rather than a little late. They never overlap (a test holds it):
 * each is one hole in the world's polygon.
 */
export const RADAR_COVER: readonly { name: string; west: number; south: number; east: number; north: number }[] = [
  { name: 'United States (MRMS)', west: -125, south: 24, east: -66.5, north: 49.5 },
  { name: 'Canada (MSC)', west: -140, south: 49.5, east: -52, north: 60 },
  { name: 'Alaska (MRMS)', west: -168, south: 54, east: -140, north: 71 },
  { name: 'Hawaii (MRMS)', west: -161, south: 18.5, east: -154.5, north: 22.5 },
  { name: 'Puerto Rico (MRMS)', west: -68, south: 17.5, east: -65, north: 19 },
  { name: 'Europe (OPERA)', west: -11, south: 35, east: 32, north: 71 },
  { name: 'Japan (JMA)', west: 127, south: 24, east: 146, north: 46 },
  { name: 'Taiwan (CWA)', west: 119, south: 21.5, east: 122.5, north: 25.5 },
]

/*
 * DROPPED, BY THEIR OWN TERMS (Batch MAP2, Section 3, checked 9 Nov):
 * MetMalaysia's open data page does not list its radar among its open
 * datasets, and PAGASA marks its radar "All Rights Reserved" with no public
 * redistribution. LibreWXR merges every source into one tile, so these
 * boxes are cleared from the tiles on the phone (rainMaskProtocol below):
 * no rain is drawn there at all, and they are hatched with the rest of
 * the world without radar.
 */
export const DROPPED: readonly { name: string; west: number; south: number; east: number; north: number }[] = [
  { name: 'Malaysia (MetMalaysia)', west: 99.5, south: 0.8, east: 116.5, north: 7.5 },
  { name: 'the Philippines (PAGASA)', west: 116.5, south: 4.5, east: 127, north: 19.5 },
]

/* The tile's corners, degrees. */
function tileBounds(z: number, x: number, y: number) {
  const n = 2 ** z
  const lon = (i: number) => (i / n) * 360 - 180
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI
  return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) }
}

/** The dropped boxes a tile touches, as pixel rectangles in the tile (256 px). */
export function droppedPixels(z: number, x: number, y: number, size = 256): { x0: number; y0: number; x1: number; y1: number }[] {
  const b = tileBounds(z, x, y)
  const n = 2 ** z
  const px = (lon: number) => (((lon + 180) / 360) * n - x) * size
  const py = (lat: number) => (((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n - y) * size
  return DROPPED.filter((d) => d.west < b.east && d.east > b.west && d.south < b.north && d.north > b.south).map((d) => ({
    x0: Math.max(0, Math.floor(px(d.west))),
    x1: Math.min(size, Math.ceil(px(d.east))),
    y0: Math.max(0, Math.floor(py(d.north))),
    y1: Math.min(size, Math.ceil(py(d.south))),
  }))
}

/** The radar boxes a tile touches, as pixel rectangles in the tile: outside them its rain is the satellite's estimate. */
export function radarPixels(z: number, x: number, y: number, size = 256): { x0: number; y0: number; x1: number; y1: number }[] {
  const b = tileBounds(z, x, y)
  const n = 2 ** z
  const px = (lon: number) => (((lon + 180) / 360) * n - x) * size
  const py = (lat: number) => (((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n - y) * size
  return RADAR_COVER.filter((d) => d.west < b.east && d.east > b.west && d.south < b.north && d.north > b.south).map((d) => ({
    x0: Math.max(0, Math.floor(px(d.west))),
    x1: Math.min(size, Math.ceil(px(d.east))),
    y0: Math.max(0, Math.floor(py(d.north))),
    y1: Math.min(size, Math.ceil(py(d.south))),
  }))
}

/** Of the satellite estimate's own alpha, what is kept: softer than radar. */
export const ESTIMATE_ALPHA = 0.55
/**
 * THE SATELLITE'S ESTIMATE, SOFTER, WITH A THIN DOTTED EDGE (Batch Polish 2,
 * Section 1; it was a hatching over the whole world without radar, raining
 * or not). Outside the radar rectangles, rain pixels keep ESTIMATE_ALPHA of
 * their alpha, and a rain pixel at the edge of its patch is a white dot on
 * every other pair: only where it is raining, and never looking like radar.
 * Returns how many pixels it changed.
 */
export function softenEstimate(rgba: Uint8ClampedArray, w: number, h: number, radar: readonly { x0: number; y0: number; x1: number; y1: number }[]): number {
  const alpha = new Uint8ClampedArray(w * h)
  for (let k = 0; k < w * h; k += 1) alpha[k] = rgba[k * 4 + 3]
  const inRadar = (x: number, y: number) => radar.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)
  const dry = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h ? false : alpha[y * w + x] === 0
  let changed = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const k = y * w + x
      if (alpha[k] === 0 || inRadar(x, y)) continue
      const edge = dry(x - 1, y) || dry(x + 1, y) || dry(x, y - 1) || dry(x, y + 1)
      if (edge && ((x + y) >> 1) % 2 === 0) rgba.set([255, 255, 255, 210], k * 4)
      else rgba[k * 4 + 3] = Math.round(alpha[k] * ESTIMATE_ALPHA)
      changed += 1
    }
  }
  return changed
}

export const RAIN_PROTOCOL = 'rainw'
/** The rain tile through the phone: as LibreWXR serves it, the dropped boxes cleared. */
export async function rainMaskProtocol(params: { url: string }, abort: AbortController): Promise<{ data: ArrayBuffer }> {
  const real = params.url.replace(`${RAIN_PROTOCOL}://`, 'https://')
  const r = await fetch(real, { signal: abort.signal })
  if (!r.ok) throw new Error(`rain tile ${r.status}`)
  const m = /\/(\d+)\/(\d+)\/(\d+)\/\d+\/[\d_]+\.png$/.exec(real)
  const cuts = m === null ? [] : droppedPixels(Number(m[1]), Number(m[2]), Number(m[3]))
  const radar = m === null ? [] : radarPixels(Number(m[1]), Number(m[2]), Number(m[3]))
  /* All radar, nothing dropped: the tile as served. */
  const allRadar = radar.some((q) => q.x0 <= 0 && q.y0 <= 0 && q.x1 >= 256 && q.y1 >= 256)
  if ((cuts.length === 0 && allRadar) || typeof OffscreenCanvas === 'undefined') return { data: await r.arrayBuffer() }
  const img = await createImageBitmap(await r.blob())
  const c = new OffscreenCanvas(img.width, img.height)
  const g = c.getContext('2d')
  if (g === null) return { data: await r.arrayBuffer() }
  g.drawImage(img, 0, 0)
  const k = img.width / 256
  for (const q of cuts) g.clearRect(q.x0 * k, q.y0 * k, (q.x1 - q.x0) * k, (q.y1 - q.y0) * k)
  if (!allRadar) {
    const px = g.getImageData(0, 0, img.width, img.height)
    softenEstimate(px.data, img.width, img.height, radar.map((q) => ({ x0: q.x0 * k, y0: q.y0 * k, x1: q.x1 * k, y1: q.y1 * k })))
    g.putImageData(px, 0, 0)
  }
  return { data: await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer() }
}

/** The world without the radar boxes, as one polygon with holes: where the map hatches. */
export function estimateArea(): GeoJSON.FeatureCollection {
  const ring = (w: number, s: number, e: number, n: number) => [[w, s], [w, n], [e, n], [e, s], [w, s]]
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring(-180, -60, 180, 70).reverse(), ...RADAR_COVER.map((b) => ring(b.west, Math.max(-60, b.south), b.east, Math.min(70, b.north)))] },
      },
    ],
  }
}

/** Whether a point is under radar (inside a box). */
export const underRadar = (lat: number, lon: number): boolean => RADAR_COVER.some((b) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north)

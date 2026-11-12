/*
 * THE SATELLITE NOWCAST, FETCHED (Batch H, Section 2.2). Arithmetic is
 * src/core/goesNowcast.ts.
 *
 * WHAT LEAVES THE PHONE: requests for public GOES-East infrared tiles from
 * NASA GIBS (already on the map's satellite layer and the privacy page), at
 * zoom 6, about 600 km a tile: a handful of tiles along the sun's line.
 * Nothing else. The tiles' pixels are read here, never through a canvas
 * (src/lib/png.ts), against GIBS's own colour table.
 */
import { advectKm, satKms, satRead, type SatRead, type SatSample } from '../core/goesNowcast.ts'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import { GOES_LAYER, GOES_MATRIX_SET } from '../core/goes.ts'
import { fetchGoesLegend } from './goesColormap.ts'
import { frameStamp, GIBS_WMTS, snapToFrame } from './goesLayer.ts'
import { decodePng } from './png.ts'

export const SAT_ZOOM = 6
/** GIBS has a frame some minutes after its time: ask for the one this long before now. */
export const SAT_LATENCY_MS = 20 * 60_000

const tileOf = (at: LatLon, z: number) => {
  const n = 2 ** z
  const x = ((at.lon + 180) / 360) * n
  const r = (at.lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return { x, y }
}

export function satTileUrl(frame: Date, x: number, y: number): string {
  return `${GIBS_WMTS}/${GOES_LAYER.infrared}/default/${frameStamp(snapToFrame(frame))}/${GOES_MATRIX_SET.infrared}/${SAT_ZOOM}/${y}/${x}.png`
}

/** The colour table as a lookup: "r,g,b" to °C (the middle of the entry's range). */
async function colourToC(fetchImpl: typeof fetch): Promise<{ rgb: [number, number, number]; c: number }[] | null> {
  const got = await fetchGoesLegend('infrared', fetchImpl)
  if (got.status !== 'ok') return null
  const kelvin = /K/.test(got.legend.units) && !/°C/.test(got.legend.units)
  const out: { rgb: [number, number, number]; c: number }[] = []
  for (const s of got.legend.stops) {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(s.color)
    if (m === null) continue
    const mid = Number.isFinite(s.from) && Number.isFinite(s.to) ? (s.from + s.to) / 2 : Number.isFinite(s.from) ? s.from : s.to
    out.push({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])], c: kelvin ? mid - 273.15 : mid })
  }
  return out
}

/*
 * THE NEAREST ENTRY, not only an exact one: a tile resampled to zoom 6
 * blends neighbouring colours, and an exact lookup lost half of 11 Oct's
 * samples. Past MATCH_WITHIN in RGB, no entry is near enough: no value.
 */
export const MATCH_WITHIN = 40
function nearestC(table: { rgb: [number, number, number]; c: number }[], r: number, g: number, b: number): number | null {
  let best: { d: number; c: number } | null = null
  for (const e of table) {
    const d = Math.hypot(e.rgb[0] - r, e.rgb[1] - g, e.rgb[2] - b)
    if (best === null || d < best.d) best = { d, c: e.c }
  }
  return best === null || best.d > MATCH_WITHIN ? null : best.c
}

/**
 * The brightness temperature every SAT_STEP_KM along the sun's line from the
 * venue, each point moved upwind by `drift` (src/core/goesNowcast.ts advect).
 */
export async function satSamples(venue: LatLon, azimuthDeg: number, frame: Date, drift: { eastKm: number; northKm: number }, fetchImpl: typeof fetch = fetch): Promise<SatSample[] | null> {
  const table = await colourToC(fetchImpl)
  if (table === null) return null
  const tiles = new Map<string, Promise<{ data: Uint8Array | Uint8ClampedArray; width: number } | null>>()
  const tile = (x: number, y: number) => {
    const key = `${x}/${y}`
    let got = tiles.get(key)
    if (got === undefined) {
      got = (async () => {
        try {
          const r = await fetchImpl(satTileUrl(frame, x, y))
          if (!r.ok) return null
          const px = await decodePng(new Uint8Array(await r.arrayBuffer()))
          return { data: px.data, width: px.width }
        } catch {
          return null
        }
      })()
      tiles.set(key, got)
    }
    return got
  }
  const out: SatSample[] = []
  for (const km of satKms()) {
    const along = km === 0 ? venue : destinationPoint(venue, azimuthDeg, km * 1000)
    const east = destinationPoint(along, 90, drift.eastKm * 1000)
    const at = destinationPoint(east, 0, drift.northKm * 1000)
    const t = tileOf(at, SAT_ZOOM)
    const tx = Math.floor(t.x)
    const ty = Math.floor(t.y)
    const img = await tile(tx, ty)
    if (img === null) {
      out.push({ km, c: null })
      continue
    }
    const px = Math.min(img.width - 1, Math.floor((t.x - tx) * img.width))
    const py = Math.min(img.width - 1, Math.floor((t.y - ty) * img.width))
    const i = (py * img.width + px) * 4
    const a = img.data[i + 3]
    out.push({ km, c: a === 0 ? null : nearestC(table, img.data[i], img.data[i + 1], img.data[i + 2]) })
  }
  return out
}

/** The nowcast for one event: the latest frame, advected to the event by the wind at cloud height. */
export async function fetchSatRead(venue: LatLon, azimuthDeg: number, event: Date, now: Date, wind: { mps: number; fromDeg: number } | null, airC: number | null, fetchImpl: typeof fetch = fetch): Promise<SatRead | null> {
  const frame = snapToFrame(new Date(now.getTime() - SAT_LATENCY_MS))
  const drift = wind === null ? { eastKm: 0, northKm: 0 } : advectKm(wind.mps, wind.fromDeg, event.getTime() - frame.getTime())
  const samples = await satSamples(venue, azimuthDeg, frame, drift, fetchImpl)
  return samples === null ? null : satRead(samples, frame, airC)
}

/**
 * The brightness temperature at each of some points (Batch BEST SKY, Section
 * 1: the patches the models smear), °C, null where the frame had nothing.
 * The same tiles and colour table as satSamples; only tile numbers are asked.
 */
export async function satAtPoints(points: readonly LatLon[], frame: Date, fetchImpl: typeof fetch = fetch): Promise<(number | null)[] | null> {
  const table = await colourToC(fetchImpl)
  if (table === null) return null
  const tiles = new Map<string, Promise<{ data: Uint8Array | Uint8ClampedArray; width: number } | null>>()
  const tile = (x: number, y: number) => {
    const key = `${x}/${y}`
    let got = tiles.get(key)
    if (got === undefined) {
      got = (async () => {
        try {
          const r = await fetchImpl(satTileUrl(frame, x, y))
          if (!r.ok) return null
          const px = await decodePng(new Uint8Array(await r.arrayBuffer()))
          return { data: px.data, width: px.width }
        } catch {
          return null
        }
      })()
      tiles.set(key, got)
    }
    return got
  }
  const out: (number | null)[] = []
  for (const at of points) {
    const t = tileOf(at, SAT_ZOOM)
    const tx = Math.floor(t.x)
    const ty = Math.floor(t.y)
    const img = await tile(tx, ty)
    if (img === null) {
      out.push(null)
      continue
    }
    const px = Math.min(img.width - 1, Math.floor((t.x - tx) * img.width))
    const py = Math.min(img.width - 1, Math.floor((t.y - ty) * img.width))
    const i = (py * img.width + px) * 4
    out.push(img.data[i + 3] === 0 ? null : nearestC(table, img.data[i], img.data[i + 1], img.data[i + 2]))
  }
  return out
}

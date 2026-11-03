/*
 * THE NEXT 0-3 HOURS, FETCHED (Batch K, Section 2). Arithmetic is
 * src/core/stormCells.ts and src/core/lightning.ts.
 *
 * WHAT LEAVES THE PHONE.
 *   Iowa State (IEM)  the composite's latest time; radar tiles round the
 *                     venue: map cells at zoom 7 (a tile is ~250 km), three
 *                     scan times
 *   NOAA nowCOAST     a box round the venue to whole tenths of a degree and
 *                     four 15-minute times: the lightning density map
 *   api.weather.gov   the venue to 2 decimals: alerts in force there
 * Asked while the Weather tab is open, every 5 minutes.
 *
 * RADAR. IEM's national base-reflectivity composite, every 5 minutes, as
 * map tiles drawn in its n0q palette (src/data/n0qPalette.ts); a colour is
 * turned back into its dBZ exactly. MRMS hail size is not served as tiles or
 * JSON anywhere free; it is not said.
 *
 * LIGHTNING. GOES GLM is served only as 20-second netCDF files, which a
 * phone cannot read in time. NOAA's nowCOAST serves the Ocean Prediction
 * Center's lightning strike density (NLDN and GLD360, ground networks) as a
 * map, every 15 minutes at 8 km: a pixel drawn is a cell with strikes in
 * that 15 minutes. So a strike is said as its 15-minute frame, never a
 * minute ("3 min ago" is more than the map knows).
 */
import { useEffect, useState } from 'react'
import { decodePng } from './png.ts'
import { N0Q_PALETTE, n0qDbz } from '../data/n0qPalette.ts'
import { findCells, flowToward, latLonPixel, nearestEcho, trackCells, type Cell, type Grid, type Scan, type Track } from '../core/stormCells.ts'
import type { LatLon } from '../core/geo.ts'
import type { Strike } from '../core/lightning.ts'
import { parseMotion, upstream, type Motion, type Upstream } from '../core/warnUpstream.ts'
import { TIMEOUT_MS } from './forecast.ts'

export const RADAR_VALID_URL = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json'
export const RADAR_TILES = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'
export const NOWCOAST_WMS = 'https://nowcoast.noaa.gov/geoserver/ows'
export const ALERTS_URL = 'https://api.weather.gov/alerts/active'
export const RADAR_Z = 7
/** Minutes back for the scans tracked: now, 10 and 20 minutes before. */
export const SCAN_AGO_MIN = [20, 10, 0] as const
const REFRESH_MS = 5 * 60_000

const PALETTE = new Map(N0Q_PALETTE.map((rgb, i) => [rgb, i]))

const stamp = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 12)
export const radarTileUrl = (at: Date, x: number, y: number) => `${RADAR_TILES}/ridge::USCOMP-N0Q-${stamp(at)}/${RADAR_Z}/${x}/${y}.png`

/** The composite's newest scan time. */
export async function radarValid(fetchImpl: typeof fetch = fetch): Promise<Date | null> {
  try {
    const r = await fetchImpl(RADAR_VALID_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return null
    const v = ((await r.json()) as { meta?: { valid?: unknown } }).meta?.valid
    const d = typeof v === 'string' ? new Date(v) : null
    return d !== null && Number.isFinite(d.getTime()) ? d : null
  } catch {
    return null
  }
}

/** The 3 x 3 tiles round the venue's, as one grid of dBZ. Null when none came back. */
export async function fetchGrid(venue: LatLon, at: Date, fetchImpl: typeof fetch = fetch, tileUrl: (x: number, y: number) => string = (x, y) => radarTileUrl(at, x, y)): Promise<Grid | null> {
  const v = latLonPixel(RADAR_Z, venue)
  const tx = Math.floor(v.gx / 256)
  const ty = Math.floor(v.gy / 256)
  const w = 768
  const g: Grid = { w, h: w, dbz: new Float32Array(w * w).fill(NaN), px0: (tx - 1) * 256, py0: (ty - 1) * 256, zoom: RADAR_Z }
  let read = 0
  await Promise.all(
    [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1].map(async (dx) => {
        try {
          const r = await fetchImpl(tileUrl(tx + dx, ty + dy), { signal: AbortSignal.timeout(TIMEOUT_MS) })
          if (!r.ok) return
          const px = await decodePng(new Uint8Array(await r.arrayBuffer()))
          if (px.width !== 256 || px.height !== 256) return
          read += 1
          for (let y = 0; y < 256; y += 1) {
            for (let x = 0; x < 256; x += 1) {
              const k = (y * 256 + x) * 4
              if (px.data[k + 3] === 0) continue
              const i = PALETTE.get((px.data[k] << 16) | (px.data[k + 1] << 8) | px.data[k + 2])
              if (i === undefined || i === 0) continue
              g.dbz[((dy + 1) * 256 + y) * w + (dx + 1) * 256 + x] = n0qDbz(i)
            }
          }
        } catch {
          /* a tile that did not come is a tile not read: counted below */
        }
      }),
    ),
  )
  return read === 0 ? null : g
}

export interface Radar {
  scanAt: Date
  tracks: Track[]
  /** The nearest rain (20 dBZ or more) on the newest scan, and where the cells are heading. */
  nearRain: { km: number; bearingDeg: number } | null
  flowToDeg: number | null
  /** Tiles read in the newest scan's grid, for "could not look". */
  scans: number
}

/** The newest scans round the venue; `asOf` replays a past scan time (5-minute steps) for the storm-day replay. */
export async function fetchRadar(venue: LatLon, fetchImpl: typeof fetch = fetch, asOf: Date | null = null): Promise<Radar | null> {
  const valid = asOf ?? (await radarValid(fetchImpl))
  if (valid === null) return null
  let newest: Grid | null = null
  const grids = await Promise.all(SCAN_AGO_MIN.map(async (ago) => {
    const at = new Date(valid.getTime() - ago * 60_000)
    const g = await fetchGrid(venue, at, fetchImpl)
    if (ago === 0) newest = g
    return g === null ? null : ({ at, cells: findCells(g) } satisfies Scan)
  }))
  const scans = grids.filter((s): s is Scan => s !== null)
  if (newest === null || scans.length === 0 || scans[scans.length - 1].at.getTime() !== valid.getTime()) return null
  const tracks = trackCells(scans)
  return { scanAt: valid, tracks, scans: scans.length, nearRain: nearestEcho(newest, venue), flowToDeg: flowToward(tracks) }
}

/* ------------------------------------------------------------- the HRRR */

/*
 * THE HRRR'S FORECAST REFLECTIVITY (Batch L, Section 3), Iowa State's tiles
 * of each hourly run: the same colour scale as the radar composite (every
 * pixel of the 4 Aug tiles is on N0Q_PALETTE), read by the same code. The
 * run two hours back is always there; its frame for the top of the hour
 * HRRR_AHEAD_MIN or more from now is the "next hour" the forming signal reads.
 */
export const HRRR_AHEAD_MIN = 45
export function hrrrPick(now: Date): { run: Date; validAt: Date; fmin: number } {
  const H = 3_600_000
  const run = new Date(Math.floor(now.getTime() / H) * H - 2 * H)
  const validAt = new Date(Math.ceil((now.getTime() + HRRR_AHEAD_MIN * 60_000) / H) * H)
  return { run, validAt, fmin: Math.round((validAt.getTime() - run.getTime()) / 60_000) }
}
export const hrrrTileUrl = (run: Date, fmin: number, x: number, y: number) => `${RADAR_TILES}/hrrr::REFD-F${String(fmin).padStart(4, '0')}-${stamp(run)}/${RADAR_Z}/${x}/${y}.png`

let hrrrKept: { key: string; got: Promise<{ cells: Cell[]; validAt: Date } | null> } | null = null
/** The HRRR's cells round the venue an hour or so ahead; asked once per run and frame. Null when the tiles did not come. */
export function fetchHrrr(venue: LatLon, now: Date, fetchImpl: typeof fetch = fetch): Promise<{ cells: Cell[]; validAt: Date } | null> {
  const p = hrrrPick(now)
  const key = `${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}|${p.run.toISOString()}|${p.fmin}`
  if (hrrrKept?.key === key && fetchImpl === fetch) return hrrrKept.got
  const got = fetchGrid(venue, p.validAt, fetchImpl, (x, y) => hrrrTileUrl(p.run, p.fmin, x, y))
    .then((g) => (g === null ? null : { cells: findCells(g), validAt: p.validAt }))
    .catch(() => null)
  if (fetchImpl === fetch) hrrrKept = { key, got }
  return got
}

/* ------------------------------------------------------------ lightning */

export const LIGHTNING_LAYER = 'lightning_detection:ldn_lightning_strike_density'
/** The box round the venue, degrees each way, and pixels across it (8 km a pixel). */
export const STRIKE_BOX_DEG = 1.5
const STRIKE_PX = 40
export const STRIKE_FRAMES = 4

/** The 15-minute frames to ask for, newest first: the last one surely published is 15 minutes behind. */
export function strikeFrames(now: Date, n = STRIKE_FRAMES): Date[] {
  const q = 15 * 60_000
  const last = Math.floor((now.getTime() - q) / q) * q
  return Array.from({ length: n }, (_, i) => new Date(last - i * q))
}

export function strikeUrl(venue: LatLon, frame: Date): string {
  const lat = Math.round(venue.lat * 10) / 10
  const lon = Math.round(venue.lon * 10) / 10
  const p = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: LIGHTNING_LAYER,
    styles: '',
    crs: 'EPSG:4326',
    bbox: [lat - STRIKE_BOX_DEG, lon - STRIKE_BOX_DEG, lat + STRIKE_BOX_DEG, lon + STRIKE_BOX_DEG].map((x) => x.toFixed(1)).join(','),
    width: String(STRIKE_PX),
    height: String(STRIKE_PX),
    format: 'image/png',
    transparent: 'true',
    time: frame.toISOString().replace('.000', ''),
  })
  return `${NOWCOAST_WMS}?${p.toString()}`
}

/** Every drawn pixel of every frame, as a strike cell with its frame. Null when no frame came back. */
export async function fetchStrikes(venue: LatLon, now: Date, fetchImpl: typeof fetch = fetch): Promise<Strike[] | null> {
  const lat = Math.round(venue.lat * 10) / 10
  const lon = Math.round(venue.lon * 10) / 10
  let read = 0
  const out: Strike[] = []
  await Promise.all(strikeFrames(now).map(async (frame) => {
    try {
      const r = await fetchImpl(strikeUrl(venue, frame), { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/png')) return
      const px = await decodePng(new Uint8Array(await r.arrayBuffer()))
      read += 1
      const step = (2 * STRIKE_BOX_DEG) / px.width
      for (let y = 0; y < px.height; y += 1) {
        for (let x = 0; x < px.width; x += 1) {
          if (px.data[(y * px.width + x) * 4 + 3] < 32) continue
          out.push({ at: { lat: lat + STRIKE_BOX_DEG - (y + 0.5) * step, lon: lon - STRIKE_BOX_DEG + (x + 0.5) * step }, frame })
        }
      }
    } catch {
      /* not read */
    }
  }))
  return read === 0 ? null : out
}

/* --------------------------------------------------------------- alerts */

export interface Alert {
  event: string
  headline: string
  description: string
  severity: string
  ends: Date | null
  sender: string
  /** The alert on weather.gov, for its full text. */
  url: string | null
  /** Its polygon, when the NWS drew one (warnings usually do): the Warnings layer. */
  polygon: GeoJSON.Polygon | null
  /** The storm's motion as the warning gives it (Batch L): for upstream. */
  motion: Motion | null
}

export function parseAlerts(payload: unknown): Alert[] {
  const fs = (payload as { features?: { id?: unknown; properties?: Record<string, unknown>; geometry?: unknown }[] } | null)?.features
  if (!Array.isArray(fs)) return []
  const s = (x: unknown) => (typeof x === 'string' ? x : '')
  return fs.flatMap((f) => {
    const p = f.properties ?? {}
    if (s(p.event) === '') return []
    const end = s(p.ends) || s(p.expires)
    return [{ event: s(p.event), headline: s(p.headline), description: s(p.description).trim(), severity: s(p.severity), ends: end === '' ? null : new Date(end), sender: s(p.senderName), url: typeof f.id === 'string' && /^https:\/\/api\.weather\.gov\/alerts\//.test(f.id) ? f.id : null, polygon: (f.geometry as { type?: unknown } | null)?.type === 'Polygon' ? (f.geometry as GeoJSON.Polygon) : null, motion: parseMotion(((p.parameters as Record<string, unknown> | undefined)?.eventMotionDescription as unknown[] | undefined)?.[0] as string | undefined) }]
  })
}

export async function fetchAlerts(venue: LatLon, fetchImpl: typeof fetch = fetch): Promise<Alert[] | null> {
  try {
    const r = await fetchImpl(`${ALERTS_URL}?point=${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}`, { headers: { accept: 'application/geo+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return null
    return parseAlerts(await r.json())
  } catch {
    return null
  }
}

/*
 * WARNINGS ANYWHERE (Batch L, Section 4): every severe thunderstorm and
 * tornado warning in force in the country, asked with no place at all;
 * which are upstream of the venue is worked out on the phone
 * (src/core/warnUpstream.ts).
 */
export const WARNINGS_URL = `${ALERTS_URL}?event=${encodeURIComponent('Severe Thunderstorm Warning,Tornado Warning')}`
export async function fetchWarnings(fetchImpl: typeof fetch = fetch): Promise<Alert[] | null> {
  try {
    const r = await fetchImpl(WARNINGS_URL, { headers: { accept: 'application/geo+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return null
    return parseAlerts(await r.json())
  } catch {
    return null
  }
}

/** The warnings upstream of the venue, nearest first: near, not over it, heading at it. */
export function upstreamWarnings(venue: LatLon, warnings: readonly Alert[] | null, radar: Radar | null): { alert: Alert; up: Upstream }[] {
  if (warnings === null) return []
  const flowKmh = radar === null ? null : (() => {
    const moving = radar.tracks.filter((t) => t.v !== null)
    if (moving.length === 0 || radar.flowToDeg === null) return null
    const sp = moving.map((t) => Math.hypot((t.v as { e: number }).e, (t.v as { n: number }).n)).sort((a, b) => a - b)
    return sp[Math.floor(sp.length / 2)]
  })()
  const flow = radar?.flowToDeg == null || flowKmh === null ? null : { towardDeg: radar.flowToDeg, kt: flowKmh / 1.852 }
  return warnings
    .flatMap((a) => {
      const up = upstream(venue, a.polygon, a.motion, flow)
      return up === null ? [] : [{ alert: a, up }]
    })
    .sort((a, b) => a.up.km - b.up.km)
}

/* ----------------------------------------------------------------- hook */

export interface Nowcast {
  radar: Radar | null
  /** The HRRR's cells an hour or so ahead (Batch L, Section 3). */
  hrrr: { cells: Cell[]; validAt: Date } | null
  strikes: Strike[] | null
  alerts: Alert[] | null
  /** Severe thunderstorm and tornado warnings nationally, for upstream ones (Batch L). */
  warnings: Alert[] | null
  /** When it was asked. */
  at: Date
}

export function useNowcast(venue: LatLon | null, on: boolean): Nowcast | null {
  const [got, setGot] = useState<Nowcast | null>(null)
  const lat = venue?.lat
  const lon = venue?.lon
  useEffect(() => {
    if (!on || lat === undefined || lon === undefined) return
    let live = true
    const at = { lat, lon }
    const ask = async () => {
      const now = new Date()
      const [radar, strikes, alerts, hrrr, warnings] = await Promise.all([fetchRadar(at).catch(() => null), fetchStrikes(at, now).catch(() => null), fetchAlerts(at), fetchHrrr(at, now), fetchWarnings()])
      if (live) setGot({ radar, hrrr, strikes, alerts, warnings, at: now })
    }
    void ask()
    const t = setInterval(() => void ask(), REFRESH_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [on, lat, lon])
  return got
}

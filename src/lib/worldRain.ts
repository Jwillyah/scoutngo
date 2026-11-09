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

export const rainTileUrl = (maps: RainMaps, frame: RainFrame): string => `${maps.host}${frame.path}/256/{z}/{x}/{y}/${RAIN_COLOUR}/${RAIN_OPTIONS}.png`

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
  { name: 'Malaysia', west: 99.5, south: 0.8, east: 116.5, north: 7.5 },
  { name: 'Philippines', west: 116.5, south: 4.5, east: 127, north: 19.5 },
]

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

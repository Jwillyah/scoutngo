/*
 * WHAT IS UP THERE NOW, FETCHED (Batch J): the observations the Sky fire
 * call leans on in the three hours before a sunrise or sunset. Arithmetic is
 * src/core/layerTruth.ts.
 *
 * WHAT LEAVES THE PHONE.
 *   Open-Meteo        the venue to 2 decimals and a date: humidity,
 *                     temperature and height at pressure levels (the layer's
 *                     height, and the satellite's cloud top on it)
 *   IEM (Iowa State)  a sounding site's id and a launch time; never the venue
 *   /api/pirep        a station id (the nearest weather station's); never the venue
 *   NASA GIBS         satellite tiles along the sun's line (src/lib/goesNowcast.ts)
 */
import type { LatLon } from '../core/geo.ts'
import { destinationPoint, distanceMeters } from '../core/geo.ts'
import { gapRead, lineDeckFt, stationsAlong, type GapRead, type LineStation } from '../core/gapWatch.ts'
import { decodePng } from './png.ts'
import { deckTruth, MODEL_MOIST_PCT, moistLayers, parsePirepSky, PIREP_HOURS, rhFromDew, SOUNDING_HOURS, SOUNDING_KM, stationDeck, topFromTemperature, type DeckTruth, type Level } from '../core/layerTruth.ts'
import { parseMetarSky, type MetarSky } from '../core/metar.ts'
import type { SatRead } from '../core/goesNowcast.ts'
import type { Layer } from '../core/skyColour.ts'
import { roundCoord } from '../core/skyFire.ts'
import { RAOB_SITES, type RaobSite } from '../data/raobSites.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { nearestHour } from './skyFireData.ts'
import { FORECAST_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200] as const

/* ------------------------------------------------------------ the profile */

export function profileUrl(venue: LatLon, date: string): string {
  const vars = PRESSURE_LEVELS.flatMap((p) => [`relative_humidity_${p}hPa`, `temperature_${p}hPa`, `geopotential_height_${p}hPa`])
  const params = new URLSearchParams({
    latitude: roundCoord(venue.lat).toFixed(2),
    longitude: roundCoord(venue.lon).toFixed(2),
    hourly: [...vars, 'temperature_2m', 'wind_speed_500hPa', 'wind_direction_500hPa', 'wind_speed_700hPa', 'wind_direction_700hPa'].join(','),
    wind_speed_unit: 'ms',
    start_date: date,
    end_date: date,
    timezone: 'GMT',
  })
  return `${OPEN_METEO_URL}?${params.toString()}`
}

export interface Profile {
  levels: Level[]
  airC: number | null
  /** The wind at 500 hPa (high cloud) and 700 hPa (a mid deck), m/s and the way it blows FROM. */
  wind500: { mps: number; fromDeg: number } | null
  wind700: { mps: number; fromDeg: number } | null
}

/** One hour of Open-Meteo's pressure levels as a profile. Null without the hour. */
export function parseProfile(payload: unknown, at: Date): Profile | null {
  const h = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  const times = h?.time
  if (!Array.isArray(times)) return null
  const i = (times as string[]).indexOf(nearestHour(at))
  if (i < 0) return null
  const v = (k: string): number | null => {
    const x = (h?.[k] as unknown[] | undefined)?.[i]
    return typeof x === 'number' && Number.isFinite(x) ? x : null
  }
  const levels: Level[] = []
  for (const p of PRESSURE_LEVELS) {
    const heightM = v(`geopotential_height_${p}hPa`)
    const tempC = v(`temperature_${p}hPa`)
    const rhPct = v(`relative_humidity_${p}hPa`)
    if (heightM !== null && tempC !== null && rhPct !== null) levels.push({ heightM, tempC, rhPct })
  }
  const wind = (p: number) => {
    const mps = v(`wind_speed_${p}hPa`)
    const fromDeg = v(`wind_direction_${p}hPa`)
    return mps === null || fromDeg === null ? null : { mps, fromDeg }
  }
  return levels.length < 4 ? null : { levels, airC: v('temperature_2m'), wind500: wind(500), wind700: wind(700) }
}

export async function fetchProfile(venue: LatLon, at: Date, fetchImpl: typeof fetch = fetch): Promise<Profile | null> {
  const got = await weatherJson(profileUrl(venue, at.toISOString().slice(0, 10)), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl, timeoutMs: TIMEOUT_MS })
  return got.ok ? parseProfile(got.payload, at) : null
}

/* ------------------------------------------------------------- soundings */

export const RAOB_URL = 'https://mesonet.agron.iastate.edu/json/raob.py'

/** The nearest sounding site within SOUNDING_KM, or null. */
export function nearestSite(venue: LatLon, sites: readonly RaobSite[] = RAOB_SITES): { site: RaobSite; km: number } | null {
  let best: { site: RaobSite; km: number } | null = null
  for (const s of sites) {
    const km = distanceMeters(venue, { lat: s.lat, lon: s.lon }) / 1000
    if (km <= SOUNDING_KM && (best === null || km < best.km)) best = { site: s, km }
  }
  return best
}

/**
 * The launch to ask for: the latest 00 Z or 12 Z whose data is in (about 90
 * minutes after), and within SOUNDING_HOURS of the event. Null when none is.
 */
export function launchFor(event: Date, now: Date): Date | null {
  const ready = now.getTime() - 90 * 60_000
  const t = new Date(Math.floor(ready / (12 * 3_600_000)) * 12 * 3_600_000)
  return Math.abs(event.getTime() - t.getTime()) <= SOUNDING_HOURS * 3_600_000 ? t : null
}

export const raobUrl = (site: string, at: Date): string => `${RAOB_URL}?ts=${at.toISOString().replace(/[-:T]/g, '').slice(0, 12)}&station=${site}`

/** IEM's sounding JSON as a profile: RH from the dew point. */
export function parseRaob(payload: unknown): Level[] | null {
  const prof = (payload as { profiles?: { profile?: { hght?: unknown; tmpc?: unknown; dwpc?: unknown }[] }[] } | null)?.profiles?.[0]?.profile
  if (!Array.isArray(prof)) return null
  const levels = prof.flatMap((l) => (typeof l.hght === 'number' && typeof l.tmpc === 'number' && typeof l.dwpc === 'number' ? [{ heightM: l.hght, tempC: l.tmpc, rhPct: rhFromDew(l.tmpc, l.dwpc) }] : []))
  return levels.length < 4 ? null : levels
}

export async function fetchSounding(venue: LatLon, event: Date, now: Date, fetchImpl: typeof fetch = fetch): Promise<{ levels: Level[]; from: string } | null> {
  const near = nearestSite(venue)
  const at = launchFor(event, now)
  if (near === null || at === null) return null
  try {
    const r = await fetchImpl(raobUrl(near.site.id, at), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return null
    const levels = parseRaob(await r.json())
    /* clock-audit: data, a launch is named by its UTC hour ("12 Z"), not a local time. */
    return levels === null ? null : { levels, from: `${near.site.id.slice(1)} ${String(at.getUTCHours()).padStart(2, '0')} Z` }
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------- PIREPs */

export const PIREP_ENDPOINT = '/api/pirep'

export async function fetchPireps(station: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const r = await fetchImpl(PIREP_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ station }), signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return []
    const body = (await r.json()) as { reports?: unknown }
    return Array.isArray(body.reports) ? body.reports.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** The first report with a broken or overcast layer and a base: who, and the layer. */
export function pirepDeck(reports: readonly string[]): { base: number | null; top: number | null; amount: string; from: string } | null {
  for (const r of reports) {
    const sky = parsePirepSky(r)
    const g = sky?.find((x) => (x.amount === 'BKN' || x.amount === 'OVC') && x.baseFt !== null)
    if (g === undefined) continue
    const who = r.split(/\s+/)[0]
    const tm = /\/TM\s*(\d{4})/.exec(r)?.[1]
    return { base: g.baseFt, top: g.topFt, amount: g.amount, from: `${who}${tm === undefined ? '' : ` ${tm} Z`}` }
  }
  return null
}
export { PIREP_HOURS }

/* ------------------------------------------------------------- the truth */

export interface ObsIn {
  station: MetarSky | null
  pireps: readonly string[]
  sounding: { levels: Level[]; from: string } | null
  profile: Profile | null
  sat: SatRead | null
  modelLayer: Layer | null
}

/** The satellite's coldest read over you, 0-20 km: the top of what is there. */
export function overheadBt(sat: SatRead | null): number | null {
  const over = sat?.samples.filter((s) => s.km <= 20 && s.c !== null).map((s) => s.c as number) ?? []
  return over.length === 0 ? null : Math.min(...over)
}

/** Every source, read into one named deck over you (src/core/layerTruth.ts). */
export function truthFrom(o: ObsIn): DeckTruth | null {
  const bt = overheadBt(o.sat)
  const groundC = o.sat?.groundC ?? o.profile?.airC ?? null
  /* A top as warm as the ground is no top: nothing over you the infrared can see. */
  const satTop = bt === null || o.profile === null || (groundC !== null && bt > groundC - 12) ? null : { btC: bt, topM: topFromTemperature(bt, o.profile.levels) }
  return deckTruth({
    station: o.station === null ? null : stationDeck(o.station),
    pirep: pirepDeck(o.pireps),
    sounding: o.sounding === null ? null : { layers: moistLayers(o.sounding.levels), from: o.sounding.from },
    satTop,
    modelRh: o.profile === null ? null : moistLayers(o.profile.levels, MODEL_MOIST_PCT),
    modelLayer: o.modelLayer,
  })
}

/* ---------------------------------------------------- the gap watch (Section 2) */

export const METAR_ENDPOINT = '/api/metar'
const NWS = 'https://api.weather.gov'

/** The latest METAR of each station, by id: this app's function (one request), else weather.gov one by one. */
export async function fetchLineSkies(ids: readonly string[], fetchImpl: typeof fetch = fetch): Promise<Map<string, MetarSky>> {
  const out = new Map<string, MetarSky>()
  if (ids.length === 0) return out
  try {
    const r = await fetchImpl(METAR_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stations: ids }), signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (r.ok) {
      const body = (await r.json()) as { metars?: unknown }
      for (const m of Array.isArray(body.metars) ? body.metars : []) {
        const sky = typeof m === 'string' ? parseMetarSky(m) : null
        if (sky !== null) out.set(sky.station, sky)
      }
    }
  } catch {
    /* weather.gov below */
  }
  await Promise.all(
    ids.filter((id) => !out.has(id)).map(async (id) => {
      try {
        const r = await fetchImpl(`${NWS}/stations/${id}/observations/latest`, { headers: { accept: 'application/geo+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!r.ok) return
        const raw = ((await r.json()) as { properties?: { rawMessage?: unknown } }).properties?.rawMessage
        const sky = typeof raw === 'string' ? parseMetarSky(raw) : null
        if (sky !== null) out.set(id, sky)
      } catch {
        /* that station says nothing */
      }
    }),
  )
  return out
}

/*
 * RADAR ALONG THE LINE: IEM's NEXRAD composite (base reflectivity, the
 * current mosaic) as map tiles, read every 10 km. A pixel with any colour is
 * an echo; the tiles are transparent where there is none.
 */
export const RADAR_TILE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913'
export const RADAR_ZOOM = 7

export async function fetchEchoes(venue: LatLon, azimuthDeg: number, reachKm: number, fetchImpl: typeof fetch = fetch): Promise<number[] | null> {
  const n = 2 ** RADAR_ZOOM
  const tiles = new Map<string, Promise<{ data: Uint8Array | Uint8ClampedArray; width: number } | null>>()
  const echoes: number[] = []
  let read = 0
  for (let km = 10; km <= reachKm; km += 10) {
    const at = destinationPoint(venue, azimuthDeg, km * 1000)
    const x = ((at.lon + 180) / 360) * n
    const r = (at.lat * Math.PI) / 180
    const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
    const key = `${Math.floor(x)}/${Math.floor(y)}`
    let t = tiles.get(key)
    if (t === undefined) {
      t = (async () => {
        try {
          const res = await fetchImpl(`${RADAR_TILE}/${RADAR_ZOOM}/${key}.png`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
          if (!res.ok) return null
          const px = await decodePng(new Uint8Array(await res.arrayBuffer()))
          return { data: px.data, width: px.width }
        } catch {
          return null
        }
      })()
      tiles.set(key, t)
    }
    const img = await t
    if (img === null) continue
    read += 1
    const px = Math.min(img.width - 1, Math.floor((x - Math.floor(x)) * img.width))
    const py = Math.min(img.width - 1, Math.floor((y - Math.floor(y)) * img.width))
    if (img.data[(py * img.width + px) * 4 + 3] > 0) echoes.push(km)
  }
  return read === 0 ? null : echoes
}

/** Every station along the line, from the baked list (loaded only for this). */
export async function lineStations(venue: LatLon, azimuthDeg: number): Promise<LineStation[]> {
  const { ASOS_STATIONS } = await import('../data/asosStations.ts')
  return stationsAlong(venue, azimuthDeg, ASOS_STATIONS)
}

/** The gap from what came back (src/core/gapWatch.ts). */
export function gapFrom(o: { azimuthDeg: number; line: readonly LineStation[]; reports: ReadonlyMap<string, MetarSky>; station: MetarSky | null; sat: SatRead | null; echoesKm: number[] | null }): GapRead {
  const over = o.station === null ? null : stationDeck(o.station)
  return gapRead({
    azimuthDeg: o.azimuthDeg,
    line: o.line,
    reports: o.reports,
    deckFt: lineDeckFt(over?.baseFt ?? null, [...o.reports.values()]),
    sat: o.sat === null ? null : { samples: o.sat.samples, groundC: o.sat.groundC },
    echoesKm: o.echoesKm,
  })
}

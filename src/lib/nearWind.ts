/*
 * THE WIND AT THE STATIONS NEAR THE SPOT: NEAREST, THEN FRESHEST (Batch TRUTH,
 * Section 3). On 12 Nov at 7:24 the Wind page said "Station KNTU 3 kt S ·
 * 5:56 AM": weather.gov's "latest" for KNTU ran an hour behind the METARs
 * aviationweather.gov already had, and nothing but airports was asked, while
 * the Chesapeake Bay Bridge Tunnel read 13 mph SSW.
 *
 * Now the nearest NEAR_COUNT stations within NEAR_KM, airports (ASOS/AWOS,
 * src/data/asosStations.ts) and NOAA's coastal stations (CO-OPS met,
 * src/data/coopsMet.ts) alike; each one's latest reading; the freshest of
 * them, and only under MAX_AGE_MS old. An airport's METAR is the newer of
 * weather.gov's and this app's /api/metar (aviationweather.gov). Only
 * station ids leave the phone; no key anywhere.
 */
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { metarVisMiles } from '../core/skyWord.ts'
import { parseMetarSky, parseMetarWind, type MetarSky } from '../core/metar.ts'
import { TIMEOUT_MS } from './forecast.ts'
import { METAR_ENDPOINT } from './skyFireData.ts'

const NWS = 'https://api.weather.gov'
const NWS_HEADERS = { accept: 'application/geo+json' }

export const NEAR_KM = 30
export const NEAR_COUNT = 3
/** Older than this, a reading is not shown (Batch TRUTH: 75 minutes). */
export const MAX_AGE_MS = 75 * 60_000
export const COOPS_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

export interface NearStation {
  kind: 'airport' | 'coastal'
  /** "KNTU", or the CO-OPS number "8638901". */
  id: string
  /** What the page calls it: "KNTU", "CBBT" (the NDBC id when there is one: "CHBV2"). */
  label: string
  name: string
  km: number
}

export interface NearReading {
  station: NearStation
  at: Date
  kt: number
  gustKt: number | null
  /** Null for variable or calm. */
  fromDeg: number | null
  /** An airport's sky and visibility (the one sky word); null for a coastal station. */
  sky: MetarSky | null
  visMi: number | null
}

type Asos = readonly [string, string, number, number]
type Coops = readonly [string, string | null, string, number, number]

/** "CBBT, Chesapeake Channel" is said "CBBT"; "Cape Henry" stays. */
const shortName = (name: string): string => name.split(',')[0].trim()

/** The nearest NEAR_COUNT stations of both kinds within NEAR_KM, nearest first. */
export function nearStations(at: LatLon, asos: readonly Asos[], coops: readonly Coops[], km = NEAR_KM, count = NEAR_COUNT): NearStation[] {
  const out: NearStation[] = []
  const box = (lat: number, lon: number) => Math.abs(lat - at.lat) <= 0.5 && Math.abs(lon - at.lon) <= 0.6
  for (const [id, name, lat, lon] of asos) {
    if (!box(lat, lon)) continue
    const d = distanceMeters(at, { lat, lon }) / 1000
    if (d <= km) out.push({ kind: 'airport', id, label: id, name, km: d })
  }
  for (const [id, , name, lat, lon] of coops) {
    if (!box(lat, lon)) continue
    const d = distanceMeters(at, { lat, lon }) / 1000
    if (d <= km) out.push({ kind: 'coastal', id, label: shortName(name), name, km: d })
  }
  return out.sort((a, b) => a.km - b.km).slice(0, count)
}

/** The freshest reading under MAX_AGE_MS at `now`; null when none is. */
export function freshest(readings: readonly (NearReading | null)[], now: Date): NearReading | null {
  const ok = readings.filter((r): r is NearReading => r !== null && now.getTime() - r.at.getTime() <= MAX_AGE_MS && r.at.getTime() <= now.getTime() + 10 * 60_000)
  return ok.sort((a, b) => b.at.getTime() - a.at.getTime() || a.station.km - b.station.km)[0] ?? null
}

/** The nearest station whose reading is under MAX_AGE_MS old (the one sky word's airport, Batch NOW). */
export function nearestFresh(readings: readonly (NearReading | null)[], now: Date): NearReading | null {
  const ok = readings.filter((r): r is NearReading => r !== null && now.getTime() - r.at.getTime() <= MAX_AGE_MS && r.at.getTime() <= now.getTime() + 10 * 60_000)
  return ok.sort((a, b) => a.station.km - b.station.km)[0] ?? null
}

/** CO-OPS's latest wind, in knots ("english"), its time GMT: "2026-11-12 13:42". */
export function parseCoopsWind(body: unknown, station: NearStation): NearReading | null {
  const row = (body as { data?: { t?: string; s?: string; d?: string; g?: string }[] } | null)?.data?.[0]
  if (row === undefined || typeof row.t !== 'string') return null
  const at = new Date(`${row.t.replace(' ', 'T')}:00Z`)
  const kt = Number(row.s)
  if (!Number.isFinite(at.getTime()) || !Number.isFinite(kt) || kt < 0) return null
  const d = Number(row.d)
  const g = Number(row.g)
  return { station, at, kt, gustKt: Number.isFinite(g) && g > kt ? g : null, fromDeg: kt === 0 || !Number.isFinite(d) ? null : d, sky: null, visMi: null }
}

/** A METAR's reading: its time from the day-hour-minute group, in the month of `now`. */
export function parseMetarReading(raw: string, station: NearStation, now: Date): NearReading | null {
  const w = parseMetarWind(raw)
  const m = /\b(\d{2})(\d{2})(\d{2})Z\b/.exec(raw)
  if (w === null || m === null) return null
  let at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Number(m[1]), Number(m[2]), Number(m[3])))
  /* A report from the end of last month read early in this one. */
  if (at.getTime() > now.getTime() + 86_400_000) at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, Number(m[1]), Number(m[2]), Number(m[3])))
  return { station, at, kt: w.kt, gustKt: w.gustKt, fromDeg: w.fromDeg, sky: parseMetarSky(raw), visMi: metarVisMiles(raw) }
}

async function airport(st: NearStation, now: Date, fetchImpl: typeof fetch): Promise<NearReading | null> {
  const nws = fetchImpl(`${NWS}/stations/${st.id}/observations/latest`, { headers: NWS_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then(async (r) => (r.ok ? (((await r.json()) as { properties?: { rawMessage?: string } }).properties?.rawMessage ?? null) : null))
    .catch(() => null)
  const avwx = fetchImpl(METAR_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ station: st.id }), signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then(async (r) => (r.ok ? (((await r.json()) as { metar?: string }).metar ?? null) : null))
    .catch(() => null)
  const got = (await Promise.all([nws, avwx])).flatMap((raw) => (typeof raw === 'string' && raw !== '' ? [parseMetarReading(raw, st, now)] : []))
  return got.filter((r): r is NearReading => r !== null).sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null
}

async function coastal(st: NearStation, fetchImpl: typeof fetch): Promise<NearReading | null> {
  const p = new URLSearchParams({ station: st.id, product: 'wind', date: 'latest', units: 'english', time_zone: 'gmt', format: 'json', application: 'scoutngo' })
  try {
    const r = await fetchImpl(`${COOPS_URL}?${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return r.ok ? parseCoopsWind(await r.json(), st) : null
  } catch {
    return null
  }
}

/** The nearest stations' readings, each asked once, and the freshest of them. */
export async function nearWind(at: LatLon, now: Date, fetchImpl: typeof fetch = fetch): Promise<{ stations: NearStation[]; readings: (NearReading | null)[]; best: NearReading | null }> {
  const [{ ASOS_STATIONS }, { COOPS_MET }] = await Promise.all([import('../data/asosStations.ts'), import('../data/coopsMet.ts')])
  const stations = nearStations(at, ASOS_STATIONS, COOPS_MET)
  const readings = await Promise.all(stations.map((s) => (s.kind === 'airport' ? airport(s, now, fetchImpl) : coastal(s, fetchImpl))))
  return { stations, readings, best: freshest(readings, now) }
}

/** "4 min ago", "1 h 10 min ago". */
export function agoWords(at: Date, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000))
  if (min < 60) return `${min} min ago`
  return `${Math.floor(min / 60)} h${min % 60 === 0 ? '' : ` ${min % 60} min`} ago`
}

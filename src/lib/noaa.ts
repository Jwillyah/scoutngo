/*
 * NOAA CO-OPS: tide stations and predictions.
 *
 * Free, no key, no account, which is why it is used: adding a key would break
 * the "bring your own key, and only one" promise in README.md.
 *
 * WHAT LEAVES THE DEVICE. The venue coordinate never goes to NOAA. The station
 * list is fetched whole and the nearest station is chosen ON THIS DEVICE, so
 * NOAA learns only which station id was asked about, not where the user is. That
 * is a deliberately better position than the map tiles, which do disclose the
 * view. Recorded in README.md alongside the Esri, OSM and Anthropic notes.
 *
 * THE STATION LIST IS FETCHED ONCE. It is about two megabytes of JSON for 3,499
 * stations and it changes a few times a year, so pulling it per generate would
 * be both slow and rude. It is trimmed to the four fields this app uses and kept
 * in localStorage, which takes it to roughly a tenth of the size.
 */

import type { TideExtreme, TideSample, TideStation } from '../core/tide.ts'

export const STATIONS_URL =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions'
export const PREDICTIONS_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

/** NOAA asks callers to identify themselves. */
export const APPLICATION = 'scoutngo'

export const STATIONS_STORAGE_KEY = 'scoutngo.tide.stations.v1'
/** Refetched after this long. The list changes a few times a year. */
export const STATIONS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const TIMEOUT_MS = 12_000

export type StationsResult =
  | { status: 'ok'; stations: TideStation[]; cached: boolean }
  | { status: 'unavailable'; reason: string }

interface RawStation {
  id?: unknown
  name?: unknown
  lat?: unknown
  lng?: unknown
  state?: unknown
}

/** Keeps only what the nearest-station search needs. */
export function parseStations(payload: unknown): TideStation[] {
  const list = (payload as { stations?: unknown })?.stations
  if (!Array.isArray(list)) return []

  const out: TideStation[] = []
  for (const raw of list as RawStation[]) {
    const lat = Number(raw.lat)
    const lon = Number(raw.lng)
    if (typeof raw.id !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    out.push({
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : raw.id,
      at: { lat, lon },
      state: typeof raw.state === 'string' ? raw.state : '',
    })
  }
  return out
}

let memory: TideStation[] | null = null

export function clearStationCache(): void {
  memory = null
  try {
    localStorage.removeItem(STATIONS_STORAGE_KEY)
  } catch {
    // A browser with storage disabled simply has no cache to clear.
  }
}

function readStored(): TideStation[] | null {
  try {
    const raw = localStorage.getItem(STATIONS_STORAGE_KEY)
    if (raw === null) return null
    const held = JSON.parse(raw) as { at?: number; stations?: TideStation[] }
    if (typeof held.at !== 'number' || !Array.isArray(held.stations)) return null
    if (Date.now() - held.at > STATIONS_MAX_AGE_MS) return null
    return held.stations
  } catch {
    return null
  }
}

function writeStored(stations: TideStation[]): void {
  try {
    localStorage.setItem(
      STATIONS_STORAGE_KEY,
      JSON.stringify({ at: Date.now(), stations }),
    )
  } catch {
    // Over quota or storage disabled. The in-memory copy still serves this tab.
  }
}

export async function fetchStations(): Promise<StationsResult> {
  if (memory !== null) return { status: 'ok', stations: memory, cached: true }

  const stored = readStored()
  if (stored !== null) {
    memory = stored
    return { status: 'ok', stations: stored, cached: true }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(STATIONS_URL, { signal: controller.signal })
    if (!response.ok) {
      return { status: 'unavailable', reason: `NOAA returned HTTP ${response.status}.` }
    }
    const stations = parseStations(await response.json())
    if (stations.length === 0) {
      return { status: 'unavailable', reason: 'NOAA returned no tide stations.' }
    }
    memory = stations
    writeStored(stations)
    return { status: 'ok', stations, cached: false }
  } catch (error) {
    return {
      status: 'unavailable',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The tide station list timed out.'
          : 'Could not reach NOAA for tide stations.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------- predictions */

export interface TidePredictions {
  extremes: TideExtreme[]
  curve: TideSample[]
}

export type PredictionsResult =
  | { status: 'ok'; predictions: TidePredictions }
  | { status: 'unavailable'; reason: string }

/** yyyymmdd in UTC, which is what the API's date range wants alongside gmt. */
const stamp = (date: Date): string =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`

/**
 * NOAA returns "2026-09-20 14:22" with no offset. Requested as gmt, so it is
 * UTC, and is parsed as UTC rather than as local: the station's timezone and the
 * venue's need not be the same, and an instant is the only thing that can be
 * compared safely against the scrubber.
 */
export function parseNoaaTime(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(text)
  if (match === null) return null
  const [, y, mo, d, h, mi] = match
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)),
  )
}

export function parseExtremes(payload: unknown): TideExtreme[] {
  const list = (payload as { predictions?: unknown })?.predictions
  if (!Array.isArray(list)) return []
  const out: TideExtreme[] = []
  for (const raw of list as { t?: unknown; v?: unknown; type?: unknown }[]) {
    if (typeof raw.t !== 'string') continue
    const at = parseNoaaTime(raw.t)
    const feet = Number(raw.v)
    if (at === null || !Number.isFinite(feet)) continue
    out.push({ at, feet, kind: raw.type === 'H' ? 'high' : 'low' })
  }
  return out
}

export function parseCurve(payload: unknown): TideSample[] {
  const list = (payload as { predictions?: unknown })?.predictions
  if (!Array.isArray(list)) return []
  const out: TideSample[] = []
  for (const raw of list as { t?: unknown; v?: unknown }[]) {
    if (typeof raw.t !== 'string') continue
    const at = parseNoaaTime(raw.t)
    const feet = Number(raw.v)
    if (at === null || !Number.isFinite(feet)) continue
    out.push({ at, feet })
  }
  return out
}

/** NOAA answers an unusable request with HTTP 200 and an error body. */
function noaaError(payload: unknown): string | null {
  const message = (payload as { error?: { message?: unknown } })?.error?.message
  return typeof message === 'string' ? message.trim() : null
}

const cache = new Map<string, PredictionsResult>()

export function clearPredictionCache(): void {
  cache.clear()
}

async function getJson(params: URLSearchParams, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${PREDICTIONS_URL}?${params.toString()}`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * High and low water plus the level curve for the day a shoot falls on.
 *
 * The range is padded by a day either side because the dates are UTC while the
 * window is venue local: without the padding a late afternoon shoot on the US
 * east coast can fall outside a single UTC day.
 */
export async function fetchPredictions(
  stationId: string,
  at: Date,
): Promise<PredictionsResult> {
  const day = 86_400_000
  const begin = stamp(new Date(at.getTime() - day))
  const end = stamp(new Date(at.getTime() + day))
  const key = `${stationId}|${begin}|${end}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const base = {
    product: 'predictions',
    application: APPLICATION,
    begin_date: begin,
    end_date: end,
    datum: 'MLLW',
    station: stationId,
    time_zone: 'gmt',
    units: 'english',
    format: 'json',
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const [hiloRaw, curveRaw] = await Promise.all([
      getJson(new URLSearchParams({ ...base, interval: 'hilo' }), controller.signal),
      getJson(new URLSearchParams(base), controller.signal),
    ])

    const failure = noaaError(hiloRaw) ?? noaaError(curveRaw)
    if (failure !== null) {
      /*
       * NOAA answers a station that publishes nothing against MLLW with a
       * message about the "Datum input", which reads as though the user typed
       * something wrong. They did not: the station simply does not predict on
       * this datum. Said plainly instead, and the caller moves to the next
       * station rather than stopping here.
       */
      const noData = /no predictions data was found|datum/i.test(failure)
      const result: PredictionsResult = {
        status: 'unavailable',
        reason: noData
          ? 'That station publishes no tide predictions for this date.'
          : `NOAA: ${failure}`,
      }
      cache.set(key, result)
      return result
    }

    const extremes = parseExtremes(hiloRaw)
    const curve = parseCurve(curveRaw)
    if (extremes.length === 0 || curve.length === 0) {
      const result: PredictionsResult = {
        status: 'unavailable',
        reason: 'That station published no predictions for this date.',
      }
      cache.set(key, result)
      return result
    }

    const result: PredictionsResult = { status: 'ok', predictions: { extremes, curve } }
    cache.set(key, result)
    return result
  } catch (error) {
    return {
      status: 'unavailable',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The tide prediction timed out.'
          : 'Could not reach NOAA for tide predictions.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/*
 * SAVE FOR OFFLINE: ONE VENUE, EVERYTHING THE SHOOT NEEDS, ON THE PHONE.
 *
 * WHY THIS EXISTS. 29 Oct, a real shoot with no service, and the map would not
 * load. The automatic ring (src/lib/useVenueCache.ts) holds the reach ring at
 * z14-18; zoom out to find the car park, or in to read a roof, and the map was
 * blank. A pack is the venue taken whole, by a tap, size first:
 *
 *   near   imagery z12-19 and elevation z12-15 for PACK_NEAR_RADIUS_M around
 *          the pin, and the map tiles the buildings, their heights and the sea
 *          come from (z12-14)
 *   wide   imagery and elevation z8-11 for PACK_FAR_RADIUS_M, to see where
 *          the venue is from a long way out
 *   data   the shoot day's forecast (wind at every height, cloud low/mid/high),
 *          the sky and wind by the hour, the sea (Open-Meteo Marine), and NOAA's
 *          tide tables for each day of the week ahead plus the month's turns
 *   scan   the 3D scan, when one is already on the phone (src/lib/lidar)
 *
 * Sun, moon, golden times and shadows need none of it: they are worked out on
 * the phone (suncalc, turf), signal or not.
 *
 * WHERE IT IS KEPT. Tiles in Cache Storage (scoutngo-tiles-v1), read by the map
 * through its tile protocol (src/lib/offlineCache.ts). Forecasts and tide
 * tables in localStorage with the time each arrived (src/lib/savedForecast.ts).
 * This list of packs in localStorage. Nothing is sent anywhere that the app
 * did not already ask, and nothing about the user leaves the phone.
 */
import { boxAround } from './tileRange.ts'
import {
  allUrls,
  deleteArea,
  downloadArea,
  formatBytes,
  isOnline,
  loadAreas,
  measureSampled,
  sampledTotal,
  type AreaPart,
  type SampledSize,
  type SavedArea,
} from './offlineCache.ts'
import type { LatLon } from '../core/geo.ts'
import { fetchVenueDay, venueClock } from './forecast.ts'
import { saveForecast, savedForecastBytes, readForecast, venueDayKey } from './savedForecast.ts'
import { fetchMarine, fetchMonthExtremes, fetchSkyHours, fetchWindMonth } from './tideSheetData.ts'
import { fetchPredictions, fetchStations, predictionsKey } from './noaa.ts'
import { nearestStations } from '../core/tide.ts'
import { STATION_ATTEMPTS } from './useTide.ts'
import { deviceTimeZone, formatClock, formatDayTime } from '../core/timezone.ts'

export const PACK_STORAGE_KEY = 'scoutngo.venuePacks.v1'
export const PACK_WIFI_KEY = 'scoutngo.pack.wifiOnly.v1'

export const PACK_NEAR_RADIUS_M = 1500
export const PACK_NEAR_IMAGERY: readonly [number, number] = [12, 19]
/* The elevation source stops at 15; MapLibre scales it past that. */
export const PACK_NEAR_TERRAIN: readonly [number, number] = [12, 15]
export const PACK_FAR_RADIUS_M = 30_000
export const PACK_FAR_ZOOMS: readonly [number, number] = [8, 11]
/** Days of tide tables from the shoot day on. */
export const PACK_TIDE_DAYS = 7

/** The two boxes a pack holds: detail near the pin, context far round it. */
export function packParts(centre: LatLon): [AreaPart, AreaPart] {
  return [
    { box: boxAround(centre, PACK_NEAR_RADIUS_M), imageryZooms: [...PACK_NEAR_IMAGERY], terrainZooms: [...PACK_NEAR_TERRAIN] },
    { box: boxAround(centre, PACK_FAR_RADIUS_M), imageryZooms: [...PACK_FAR_ZOOMS], terrainZooms: [...PACK_FAR_ZOOMS] },
  ]
}

/** How many tiles a pack holds, for the size line and the tests. */
export const packTileCount = (centre: LatLon): number => {
  const [near, far] = packParts(centre)
  return allUrls({ ...near, extra: [far] }).length
}

/* ------------------------------------------------------------------ records */

/** What a pack holds besides tiles, each said as saved or not, never assumed. */
export interface PackData {
  /** The shoot day's wind and cloud. */
  day: boolean
  /** The sky (cloud at three heights, visibility) and wind by the hour. */
  hours: boolean
  /** The sea. 'inland' when Open-Meteo Marine has nothing here. */
  marine: boolean | 'inland'
  /** Days of tide tables kept, and the station's name, or why there are none. */
  tideDays: number
  tideStation: string | null
  /** A 3D scan of this patch was already on the phone. */
  scan: boolean
}

export interface VenuePack {
  id: string
  lat: number
  lon: number
  /** The venue's name as the app shows it. */
  name: string
  /** The shoot day it was saved for, venue local, YYYY-MM-DD. */
  day: string
  timeZone: string
  areaId: string
  /** ISO instant the pack finished saving. */
  savedAt: string
  tileBytes: number
  dataBytes: number
  /** The saved-forecast keys it wrote, so its data can be sized and checked. */
  keys: string[]
  data: PackData
}

/** The same place to about ten metres: a pack is for this venue, or it is not. */
export const samePlace = (a: LatLon, b: LatLon): boolean =>
  Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4

const isPack = (p: unknown): p is VenuePack => {
  const v = p as Partial<VenuePack> | null
  return (
    typeof v?.id === 'string' &&
    typeof v.lat === 'number' &&
    typeof v.lon === 'number' &&
    typeof v.name === 'string' &&
    typeof v.day === 'string' &&
    typeof v.areaId === 'string' &&
    typeof v.savedAt === 'string' &&
    typeof v.tileBytes === 'number' &&
    typeof v.dataBytes === 'number' &&
    Array.isArray(v.keys) &&
    typeof v.data === 'object' &&
    v.data !== null
  )
}

export function loadPacks(): VenuePack[] {
  try {
    const raw = localStorage.getItem(PACK_STORAGE_KEY)
    const list = raw === null ? [] : (JSON.parse(raw) as unknown)
    /* A pack whose tiles are gone (deleted from the area list) is not offline-ready. */
    const areas = new Set(loadAreas().map((a) => a.id))
    return Array.isArray(list) ? list.filter(isPack).filter((p) => areas.has(p.areaId)) : []
  } catch {
    return []
  }
}

const listeners = new Set<() => void>()
export function onPacksChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function savePacks(packs: VenuePack[]): void {
  try {
    localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(packs))
  } catch {
    /* The tiles and the data are saved; only the list could not be. */
  }
  for (const l of listeners) l()
}

export const packFor = (at: LatLon | null): VenuePack | null =>
  at === null ? null : (loadPacks().find((p) => samePlace(p, at)) ?? null)

export const packBytes = (p: VenuePack): number => p.tileBytes + p.dataBytes

export async function deletePack(id: string): Promise<void> {
  const pack = loadPacks().find((p) => p.id === id)
  if (pack !== undefined) await deleteArea(pack.areaId)
  savePacks(loadPacks().filter((p) => p.id !== id))
}

/* ------------------------------------------------------------- the network */

/** Wi-Fi, cellular, or the phone does not say (iOS Safari never does). */
export type NetworkKind = 'wifi' | 'cellular' | 'unknown'

export function networkKind(): NetworkKind {
  const c = (globalThis.navigator as Navigator & { connection?: { type?: string } } | undefined)?.connection
  const type = c?.type
  if (type === 'wifi' || type === 'ethernet') return 'wifi'
  if (type === 'cellular') return 'cellular'
  return 'unknown'
}

/** On by default: a pack is tens of megabytes. */
export function wifiOnly(): boolean {
  try {
    return localStorage.getItem(PACK_WIFI_KEY) !== '0'
  } catch {
    return true
  }
}

export function setWifiOnly(on: boolean): void {
  try {
    localStorage.setItem(PACK_WIFI_KEY, on ? '1' : '0')
  } catch {
    /* Not kept; the default stays on. */
  }
}

/**
 * May a pack start now? 'go', 'wait' for Wi-Fi (the phone says cellular and
 * Wi-Fi only is on), or 'ask' when the phone does not say which network it is
 * on, which is every iPhone: the button then names the size and the choice is
 * the shooter's.
 */
export function mayStart(kind: NetworkKind, onlyWifi: boolean): 'go' | 'wait' | 'ask' {
  if (kind === 'wifi') return 'go'
  if (kind === 'cellular') return onlyWifi ? 'wait' : 'go'
  return 'ask'
}

/* ------------------------------------------------------------- measuring */

export interface PackSize {
  sampled: SampledSize
  /** Bytes, or null when the imagery could not be measured. */
  total: number | null
}

export async function measurePack(centre: LatLon, signal?: AbortSignal): Promise<PackSize> {
  const sampled = await measureSampled(packParts(centre), signal)
  return { sampled, total: sampledTotal(sampled) }
}

/** The size, short enough for one line: "About 48.0 MB". The method is packSizeNote. */
export function packSizeLine(size: PackSize): string {
  if (size.sampled.tiles === size.sampled.alreadySaved) return 'Already on this phone.'
  if (size.total === null) return 'The size could not be measured with this signal.'
  return `About ${formatBytes(size.total)}`
}

/** How the size was got, under it: "Estimated from 160 tiles measured." */
export const packSizeNote = (size: PackSize): string | null =>
  size.total === null || size.sampled.tiles === size.sampled.alreadySaved ? null : `Estimated from ${size.sampled.measured} tiles measured, before anything downloads.`

/* -------------------------------------------------------------- saving */

export type PackProgress =
  | { step: 'tiles'; done: number; total: number; bytes: number }
  | { step: 'data'; what: string }

export type PackResult =
  | { status: 'ok'; pack: VenuePack }
  | { status: 'cancelled' }
  | { status: 'error'; reason: string }

export interface PackRequest {
  centre: LatLon
  name: string
  /** The shoot's start, which fixes the day. */
  shootAt: Date
  timeZone: string
}

const DAY_MS = 86_400_000

/**
 * The data half: each fetch writes its own saved copy (the same one the app
 * reads with no signal), and each is then checked as kept, not assumed.
 */
export async function savePackData(
  req: PackRequest,
  onStep: (what: string) => void = () => {},
): Promise<{ keys: string[]; data: Omit<PackData, 'scan'> }> {
  const { centre, shootAt, timeZone } = req
  const keys: string[] = []
  const place = `${centre.lat.toFixed(3)},${centre.lon.toFixed(3)}`

  onStep('the forecast for the day')
  const dayKey = venueDayKey(centre.lat, centre.lon, venueClock(shootAt, timeZone).date, timeZone)
  const dayResult = await fetchVenueDay(centre, shootAt, timeZone)
  if (dayResult.status === 'ok') saveForecast(dayKey, dayResult.payload)
  const day = readForecast(dayKey) !== null
  if (day) keys.push(dayKey)

  onStep('the sky and wind by the hour')
  const [sky, wind] = await Promise.all([fetchSkyHours(centre), fetchWindMonth(centre)])
  const hours = sky !== null && wind !== null
  if (sky !== null) keys.push(`sky-hours|${place}`)
  if (wind !== null) keys.push(`wind-month|${place}`)

  onStep('the sea')
  const sea = await fetchMarine(centre)
  /* Null both inland and on a failed request: which one is told by the signal. */
  const marine: PackData['marine'] = sea !== null ? true : isOnline() ? 'inland' : false
  if (sea !== null) keys.push(`marine|${place}`)

  onStep('the tide tables')
  let tideDays = 0
  let tideStation: string | null = null
  const stations = await fetchStations()
  if (stations.status === 'ok') {
    for (const candidate of nearestStations(centre, stations.stations, STATION_ATTEMPTS)) {
      if (candidate.proximity === 'none') break
      const first = await fetchPredictions(candidate.station.id, shootAt)
      if (first.status !== 'ok') continue
      tideStation = candidate.station.name
      for (let d = 0; d < PACK_TIDE_DAYS; d += 1) {
        const at = new Date(shootAt.getTime() + d * DAY_MS)
        const r = d === 0 ? first : await fetchPredictions(candidate.station.id, at)
        const key = predictionsKey(candidate.station.id, at)
        if (r.status === 'ok' && readForecast(key) !== null) {
          tideDays += 1
          keys.push(key)
        }
      }
      const month = await fetchMonthExtremes(candidate.station.id, shootAt)
      if (month !== null) {
        const ymd = shootAt.toISOString().slice(0, 10).replaceAll('-', '')
        keys.push(`tide-month|${candidate.station.id}|${ymd}`)
      }
      break
    }
  }
  return { keys: keys.filter((k) => readForecast(k) !== null), data: { day, hours, marine, tideDays, tideStation } }
}

/** A 3D scan of this patch already on the phone (src/lib/lidar/store.ts), which the pack then counts. */
async function keptScan(at: LatLon): Promise<boolean> {
  const [{ loadScan }, { areaFor }] = await Promise.all([import('./lidar/store.ts'), import('./lidar/grid.ts')])
  return (await loadScan(areaFor(at.lat, at.lon).id)) !== null
}

export async function saveVenuePack(
  req: PackRequest,
  signal: AbortSignal,
  onProgress: (p: PackProgress) => void = () => {},
  hasScan: (at: LatLon) => Promise<boolean> = keptScan,
): Promise<PackResult> {
  const [near, far] = packParts(req.centre)
  const tiles = await downloadArea(
    { kind: 'pack', label: req.name, ...near, extra: [far] },
    signal,
    (done, total, bytes) => onProgress({ step: 'tiles', done, total, bytes }),
  )
  if (tiles.status === 'cancelled') return { status: 'cancelled' }
  if (tiles.status === 'error') return { status: 'error', reason: tiles.reason }

  const { keys, data } = await savePackData(req, (what) => onProgress({ step: 'data', what }))
  if (signal.aborted) return { status: 'cancelled' }
  const scan = await hasScan(req.centre).catch(() => false)
  const area: SavedArea = tiles.area
  const pack: VenuePack = {
    id: `pack-${Date.now().toString(36)}`,
    lat: req.centre.lat,
    lon: req.centre.lon,
    name: req.name,
    day: venueClock(req.shootAt, req.timeZone).date,
    timeZone: req.timeZone,
    areaId: area.id,
    savedAt: new Date().toISOString(),
    tileBytes: area.bytes,
    dataBytes: keys.reduce((sum, k) => sum + savedForecastBytes(k), 0),
    keys,
    data: { ...data, scan },
  }
  /* One pack per venue: a fresh save replaces the old one, whose area goes (tiles both hold are kept). */
  const old = loadPacks().filter((p) => samePlace(p, pack))
  for (const o of old) if (o.areaId !== pack.areaId) await deleteArea(o.areaId)
  savePacks([pack, ...loadPacks().filter((p) => !samePlace(p, pack))])
  return { status: 'ok', pack }
}

/* ------------------------------------------------------------- words */

/** What a pack could not keep, in words, for the saved list. */
export function packMissing(p: VenuePack): string[] {
  const out: string[] = []
  if (!p.data.day) out.push('the day’s forecast')
  if (!p.data.hours) out.push('the sky by the hour')
  if (p.data.marine === false) out.push('the sea')
  if (p.data.tideStation !== null && p.data.tideDays < PACK_TIDE_DAYS) out.push(`${PACK_TIDE_DAYS - p.data.tideDays} days of tides`)
  return out
}

/** The phone's clock time a pack was saved, as the offline line says it: "9:12 AM", or "Oct 29, 9:12 AM" another day. */
export function savedClock(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  const zone = deviceTimeZone()
  const sameDay = at.toDateString() === now.toDateString()
  return sameDay ? formatClock(at, zone) : formatDayTime(at, zone)
}

/** The one line over the map with no signal (docs/ux-rules.md, 2 and 13). */
export function offlineLine(pack: VenuePack | null, now: Date = new Date()): string {
  return pack === null
    ? 'Offline · nothing saved here · sun and shadows still work'
    : `Offline · using saved data from ${savedClock(pack.savedAt, now)}`
}


/*
 * THE WATER'S TEMPERATURE AT A SPOT: ASKED, KEPT, SHARED (Batch FIX, Section 4).
 *
 * Which reading is said is src/core/waterTemp.ts. This asks for the readings,
 * cheapest and most private first, and stops as soon as one will do:
 *
 *   1  the stations near (CO-OPS from the phone, NDBC through /api/buoy):
 *      only station ids leave the phone, from the lists baked into the app
 *      (src/data/coopsWaterTemp.ts, src/data/ndbc.ts);
 *   2  on the sea with no station close: /api/sst, the satellite, sent the
 *      spot snapped to a half degree (about 55 km), never finer;
 *   3  then the USGS gauges near (src/data/usgsWaterTemp.ts): site numbers
 *      only, from the phone (waterservices.usgs.gov sends CORS).
 *
 * KEPT ON THE PHONE with the rest of what is yours (localStorage, never
 * sent): the last reading per spot, so with no signal the screens still say
 * it, with its age. One ask per spot per ASK_EVERY_MS, however many screens
 * say it.
 */
import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { parseBuoyWater, parseCoopsWater, parseUsgsWater, nearestSst, pickWater, sitesNear, sstCell, STATION_KM, RIVER_KM, type SstGrid, type WaterReading, type WaterSite } from '../core/waterTemp.ts'
import { postBuoy } from './buoy.ts'
import { COOPS_URL } from './nearWind.ts'
import { TIMEOUT_MS } from './forecast.ts'
import { placeKeyOf, resolveReach } from './placeMemory.ts'
import { SURF_COAST_M } from './surfSetting.ts'
import { NDBC_BUOYS } from '../data/ndbc.ts'

export const SST_ENDPOINT = '/api/sst'
export const USGS_IV_URL = 'https://waterservices.usgs.gov/nwis/iv/'
export const WATER_KEY = 'scoutngo.waterTemp.v1'
/** A kept reading older than this is not shown, even offline. */
export const KEPT_MAX_MS = 48 * 3_600_000
const KEPT_MAX = 40
/** One ask per spot this often. */
export const ASK_EVERY_MS = 30 * 60_000

export type WaterState =
  | { status: 'loading' }
  | { status: 'ok'; reading: WaterReading; kept: boolean }
  | { status: 'none' }

/** The spot to 3 decimals (about 100 m): the key in memory and on the phone. */
export const waterKeyOf = (at: LatLon): string => `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`

/* --------------------------------------------------------------- kept */

interface Kept {
  site: WaterSite
  at: string
  c: number
  /** When it was asked. */
  asked: string
}

function readKept(): Record<string, Kept> {
  try {
    const v = JSON.parse(localStorage.getItem(WATER_KEY) ?? '{}') as unknown
    return v !== null && typeof v === 'object' ? (v as Record<string, Kept>) : {}
  } catch {
    return {}
  }
}

/** The kept reading for a spot, under KEPT_MAX_MS old; null otherwise. */
export function keptWater(key: string, now: Date): WaterReading | null {
  const k = readKept()[key]
  if (k === undefined || typeof k.c !== 'number' || typeof k.at !== 'string' || k.site === undefined) return null
  const at = new Date(k.at)
  if (!Number.isFinite(at.getTime()) || now.getTime() - at.getTime() > KEPT_MAX_MS) return null
  return { site: k.site, at, c: k.c }
}

export function keepWater(key: string, r: WaterReading, now: Date): void {
  const all = readKept()
  all[key] = { site: r.site, at: r.at.toISOString(), c: r.c, asked: now.toISOString() }
  const keys = Object.keys(all).sort((a, b) => (all[a].asked ?? '').localeCompare(all[b].asked ?? ''))
  for (const k of keys.slice(0, Math.max(0, keys.length - KEPT_MAX))) delete all[k]
  try {
    localStorage.setItem(WATER_KEY, JSON.stringify(all))
  } catch {
    /* Not kept; this session still has it. */
  }
}

/* --------------------------------------------------------------- asking */

export interface WaterDeps {
  fetchImpl: typeof fetch
  /** NDBC through /api/buoy (src/lib/buoy.ts postBuoy). */
  buoy: (id: string) => Promise<Response>
  /** The map tiles' ocean within SURF_COAST_M: true, false, null when not known. */
  ocean: (at: LatLon) => Promise<boolean | null>
  lists: () => Promise<{ coops: readonly (readonly [string, string, number, number])[]; buoys: readonly (readonly [string, number, number, string])[]; usgs: () => Promise<readonly (readonly [string, string, number, number])[]> }>
}

async function defaultOcean(at: LatLon): Promise<boolean | null> {
  const { seaReach } = await import('./coast.ts')
  const m = resolveReach(placeKeyOf(at.lat, at.lon), await seaReach(at, SURF_COAST_M))
  return m === undefined ? null : m !== null
}

const DEFAULT_DEPS: WaterDeps = {
  fetchImpl: (...a) => fetch(...a),
  buoy: (id) => postBuoy(id),
  ocean: defaultOcean,
  lists: async () => {
    const { COOPS_WATER_TEMP } = await import('../data/coopsWaterTemp.ts')
    return { coops: COOPS_WATER_TEMP, buoys: NDBC_BUOYS, usgs: async () => (await import('../data/usgsWaterTemp.ts')).USGS_WATER_TEMP }
  },
}

/** What the asking found: the reading, and whether any source answered at all (no answer: offline, say the kept one). */
export interface WaterAsked {
  reading: WaterReading | null
  answered: boolean
}

/* One satellite ask per half-degree cell per ASK_EVERY_MS: every spot and marker position in the cell reads the same grid. */
const grids = new Map<string, { t: number; p: Promise<SstGrid | null | 'unreachable'> }>()

function sstGrid(cell: LatLon, now: Date, fetchImpl: typeof fetch): Promise<SstGrid | null | 'unreachable'> {
  const key = `${cell.lat},${cell.lon}`
  const hit = grids.get(key)
  if (hit !== undefined && now.getTime() - hit.t < ASK_EVERY_MS) return hit.p
  const p = (async (): Promise<SstGrid | null | 'unreachable'> => {
    try {
      const r = await fetchImpl(SST_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cell), signal: AbortSignal.timeout(20_000) })
      const body = r.ok ? ((await r.json()) as { status?: string } & Partial<SstGrid>) : null
      return body?.status === 'ok' && typeof body.day === 'string' && Array.isArray(body.rows) ? (body as SstGrid) : null
    } catch {
      return 'unreachable'
    }
  })()
  grids.set(key, { t: now.getTime(), p })
  void p.then((g) => {
    if (g === 'unreachable' || g === null) grids.delete(key)
  })
  return p
}

export async function askWater(at: LatLon, now: Date, deps: WaterDeps = DEFAULT_DEPS): Promise<WaterAsked> {
  let answered = false
  const ocean = await deps.ocean(at).catch(() => null)
  const lists = await deps.lists()
  const { stations } = sitesNear(at, lists.coops, lists.buoys, [], ocean === false ? RIVER_KM : STATION_KM)
  const stationReadings = await Promise.all(
    stations.map(async (site) => {
      try {
        if (site.kind === 'coops') {
          const p = new URLSearchParams({ station: site.id, product: 'water_temperature', date: 'latest', units: 'metric', time_zone: 'gmt', format: 'json', application: 'scoutngo' })
          const r = await deps.fetchImpl(`${COOPS_URL}?${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
          answered = true
          return r.ok ? parseCoopsWater(await r.json(), site) : null
        }
        const r = await deps.buoy(site.id)
        answered = true
        return r.ok ? parseBuoyWater(await r.json(), site) : null
      } catch {
        return null
      }
    }),
  )
  const first = pickWater({ ocean, stations: stationReadings, satellite: null, rivers: [] }, now)
  if (first !== null) return { reading: first, answered }

  let satellite: WaterReading | null = null
  if (ocean === true) {
    const grid = await sstGrid(sstCell(at), now, deps.fetchImpl)
    if (grid !== 'unreachable') answered = true
    if (grid !== 'unreachable' && grid !== null) satellite = nearestSst(grid, at)
  }
  const second = pickWater({ ocean, stations: stationReadings, satellite, rivers: [] }, now)
  if (second !== null) return { reading: second, answered }

  const { rivers } = sitesNear(at, [], [], await lists.usgs(), RIVER_KM)
  let riverReadings: WaterReading[] = []
  if (rivers.length > 0) {
    try {
      const p = new URLSearchParams({ format: 'json', sites: rivers.map((s) => s.id).join(','), parameterCd: '00010', siteStatus: 'active' })
      const r = await deps.fetchImpl(`${USGS_IV_URL}?${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      answered = true
      riverReadings = r.ok ? parseUsgsWater(await r.json(), rivers) : []
    } catch {
      /* No gauge reading. */
    }
  }
  return { reading: pickWater({ ocean, stations: stationReadings, satellite, rivers: riverReadings }, now), answered: answered || (stations.length === 0 && rivers.length === 0 && ocean !== true) }
}

/* ------------------------------------------------------------ the store */

const asked = new Map<string, { t: number; p: Promise<WaterState> }>()

/** The spot's water, asked at most once per ASK_EVERY_MS; the kept reading when nothing answered. */
export function waterAt(at: LatLon, now = new Date(), deps: WaterDeps = DEFAULT_DEPS): Promise<WaterState> {
  const key = waterKeyOf(at)
  const hit = asked.get(key)
  if (hit !== undefined && now.getTime() - hit.t < ASK_EVERY_MS) return hit.p
  const p = askWater(at, now, deps)
    .then(({ reading, answered }): WaterState => {
      if (reading !== null) {
        keepWater(key, reading, now)
        return { status: 'ok', reading, kept: false }
      }
      const kept = answered ? null : keptWater(key, now)
      return kept === null ? { status: 'none' } : { status: 'ok', reading: kept, kept: true }
    })
    .catch((): WaterState => {
      const kept = keptWater(key, now)
      return kept === null ? { status: 'none' } : { status: 'ok', reading: kept, kept: true }
    })
  asked.set(key, { t: now.getTime(), p })
  /* A failed ask is not held for the half hour: the next screen asks again. */
  void p.then((s) => {
    if (s.status !== 'ok' || s.kept) asked.delete(key)
  })
  return p
}

/** For tests: forget what was asked. */
export function forgetWater(): void {
  asked.clear()
  grids.clear()
}

/** A moving marker asks once it has stopped this long. */
export const SETTLE_MS = 600

/** The spot's water for a screen; null `at` asks nothing. */
export function useWaterTemp(at: LatLon | null): WaterState {
  const lat = at?.lat ?? null
  const lon = at?.lon ?? null
  const [state, setState] = useState<{ key: string | null; s: WaterState }>({ key: null, s: { status: 'loading' } })
  const key = lat === null || lon === null ? null : waterKeyOf({ lat, lon })
  /* While it is asked, the copy kept on the phone, said as saved. */
  const kept = useMemo(() => (key === null ? null : keptWater(key, new Date())), [key])
  useEffect(() => {
    if (lat === null || lon === null) return
    let live = true
    const k = waterKeyOf({ lat, lon })
    const t = setTimeout(() => {
      void waterAt({ lat, lon }).then((s) => {
        if (live) setState({ key: k, s })
      })
    }, SETTLE_MS)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [lat, lon])
  if (key !== null && state.key === key) return state.s
  return kept === null ? { status: 'loading' } : { status: 'ok', reading: kept, kept: true }
}

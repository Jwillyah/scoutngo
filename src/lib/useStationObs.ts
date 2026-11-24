/*
 * THE STATION NEAR THE SPOT, NOW (Batch MAP2, Section 2; Batch TRUTH,
 * Section 3; Batch FIX, Section 1). The nearest three stations within 30 km,
 * airports and NOAA's coastal stations alike (src/lib/nearWind.ts), and ONE
 * of them picked by src/core/stationPick.ts: fresh, the coast first at a
 * beach, held for half an hour, its last reading kept on the phone for a
 * load where it does not answer. What src/core/nowcast.ts leans "now"
 * toward, and the station every screen names.
 *
 * One store for every screen (the home, the Wind page, the map's readout,
 * the drone page, the surf call): one question per spot, again every 10
 * minutes while any screen shows it, and every screen reads the same answer.
 * 17 Nov at 7:06 each screen asked on its own and two loads a minute apart
 * leaned to two different stations.
 *
 * The sky and visibility for the one sky word come from the nearest airport
 * among them whose report is fresh (Batch NOW, Section 1.3: by the station,
 * not by the wind's pick, so the same station is the same word), with its
 * own time. Only station ids are asked. The choice stays on this phone
 * (localStorage, CHOICE_KEY), keyed by the spot to 2 decimals.
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { StationObs } from '../core/nowcast.ts'
import type { MetarSky } from '../core/metar.ts'
import { freshPool, pickStation, reviveChoice, withRemembered, type PickWhy, type StationChoice } from '../core/stationPick.ts'
import { coastFacing } from './coast.ts'
import { nearestFresh, nearWind, type NearReading, type NearStation } from './nearWind.ts'
import { normalizeWind, stationOrder, type Normalized } from '../core/stationWind.ts'

const KT = 0.514444

export interface StationNow extends StationObs {
  id: string
  /** What the page calls it: "KNTU", "Cape Henry". */
  label: string
  kind: NearStation['kind']
  km: number
  /** Why this one (src/core/stationPick.ts): held from an earlier load, the coast first, the nearest, the newest. */
  why: PickWhy
  /** The freshest airport report's sky and visibility, for the one sky word (src/core/skyWord.ts). */
  sky: MetarSky | null
  visMi: number | null
  /** That airport's report time, and its id. */
  skyAt: Date | null
  skyId: string | null
  /**
   * Batch NOW, Section 2: `mps` and `gustMps` are the reading carried to 10 m
   * over the spot (src/core/stationWind.ts); what the station itself read,
   * and how it was carried.
   */
  rawMps: number
  rawGustMps: number | null
  norm: Normalized
  /** The nearest fresh coastal station's, at a beach, for the page's "models · station" line. */
  coast: { label: string; rawKt: number; normKt: number } | null
  /**
   * Batch SIMPLE-3, Sections 1 and 1b: every airport's raw METAR this load
   * brought back, each with its distance, for the fog and rain nowcasts
   * (src/lib/useFogRain.ts: present weather, air and dew point, visibility).
   * The rules there judge freshness and distance themselves.
   */
  reports?: readonly StationReport[]
}

/** One airport report as it came back: its id, km from the spot, when it was made, and the METAR itself. */
export interface StationReport {
  id: string
  km: number
  at: Date
  raw: string
}

/** One load's answers: the stations asked, each one's reading (null: no answer). */
export interface StationLoad {
  stations: readonly NearStation[]
  readings: readonly (NearReading | null)[]
}

/**
 * THE PIPELINE, PURE: one load's answers, the beach's facing (null inland or
 * not known), the time and the phone's last choice in; the station now and
 * the choice to keep out. A reload is this again with the kept choice.
 */
export function stationNowFrom(load: StationLoad, facing: number | null, now: Date, prev: StationChoice | null): { value: StationNow | null; choice: StationChoice | null } {
  const make = (id: string, r: StationChoice['reading']): NearReading | null => {
    const station = load.stations.find((s) => s.id === id)
    return station === undefined ? null : { station, at: new Date(r.at), kt: r.kt, gustKt: r.gustKt, fromDeg: r.fromDeg, sky: null, visMi: null }
  }
  const readings = withRemembered(load.readings, prev, make)
  const pick = pickStation(readings, now, prev, facing !== null)
  if (pick === null) return { value: null, choice: prev }
  const best = pick.reading
  const norm = normalizeWind({ id: best.station.id, kind: best.station.kind, mps: best.kt * KT, gustMps: best.gustKt === null ? null : best.gustKt * KT, fromDeg: best.fromDeg }, facing)
  const coastRead = facing === null ? null : (stationOrder(freshPool(readings, now).filter((r) => r.station.kind === 'coastal'), true)[0] ?? null)
  const coastNorm = coastRead === null ? null : normalizeWind({ id: coastRead.station.id, kind: 'coastal', mps: coastRead.kt * KT, gustMps: null, fromDeg: coastRead.fromDeg }, facing)
  const air = nearestFresh(load.readings.filter((r) => r?.station.kind === 'airport'), now)
  return {
    choice: pick.choice,
    value: {
      id: best.station.id,
      label: best.station.label,
      kind: best.station.kind,
      km: best.station.km,
      why: pick.why,
      at: best.at,
      mps: norm.mps,
      fromDeg: best.fromDeg,
      gustMps: norm.gustMps,
      rawMps: best.kt * KT,
      rawGustMps: best.gustKt === null ? null : best.gustKt * KT,
      norm,
      coast: coastRead === null || coastNorm === null ? null : { label: coastRead.station.label, rawKt: coastRead.kt, normKt: coastNorm.mps / KT },
      sky: air?.sky ?? null,
      visMi: air?.visMi ?? null,
      skyAt: air?.at ?? null,
      skyId: air?.station.id ?? null,
      reports: load.readings.flatMap((r) => (r === null || r.raw === undefined || r.station.kind !== 'airport' ? [] : [{ id: r.station.id, km: r.station.km, at: r.at, raw: r.raw }])),
    },
  }
}

/* ------------------------------------------------------ the kept choice */

export const CHOICE_KEY = 'scoutngo.windStation.v1'
export const spotKeyOf = (spot: LatLon): string => `${spot.lat.toFixed(2)},${spot.lon.toFixed(2)}`

export function readChoice(key: string): StationChoice | null {
  try {
    const all = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? '{}') as Record<string, unknown>
    return reviveChoice(all?.[key] ?? null)
  } catch {
    return null
  }
}

function keepChoice(key: string, choice: StationChoice | null): void {
  try {
    const all = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? '{}') as Record<string, unknown>
    /* A day without a look at a spot drops its choice: the list never grows past the spots in use. */
    const day = Date.now() - 86_400_000
    const kept = Object.fromEntries(Object.entries(all ?? {}).filter(([, v]) => (reviveChoice(v)?.chosenAt ?? 0) > day))
    if (choice === null) delete kept[key]
    else kept[key] = choice
    localStorage.setItem(CHOICE_KEY, JSON.stringify(kept))
  } catch {
    /* Private browsing or a full quota: the session still holds it in memory. */
  }
}

/* ------------------------------------------------------- the one store */

/** The beach's facing, or null inland; waits at most FACING_WAIT_MS (the sea polygons can take seconds on a slow link). */
const FACING_WAIT_MS = 4000
async function facingOf(spot: LatLon): Promise<number | null> {
  const f = await Promise.race([coastFacing(spot).catch(() => 'unavailable' as const), new Promise<'unavailable'>((r) => setTimeout(() => r('unavailable'), FACING_WAIT_MS))])
  return f === 'inland' || f === 'unavailable' ? null : f.facing
}

export const ASK_EVERY_MS = 10 * 60_000

interface Entry {
  spot: LatLon
  value: StationNow | null
  askedAt: number
  asking: boolean
  /** The last facing that came back, so a slow coast lookup on a later load does not move the beach. */
  facing: number | null | undefined
  choice: StationChoice | null
  listeners: Set<() => void>
  timer: ReturnType<typeof setInterval> | null
}

const entries = new Map<string, Entry>()

async function ask(key: string, e: Entry): Promise<void> {
  if (e.asking) return
  e.asking = true
  e.askedAt = Date.now()
  try {
    const now = new Date()
    const f = await facingOf(e.spot)
    if (f !== null || e.facing === undefined) e.facing = f
    const facing = e.facing ?? null
    const got = await nearWind(e.spot, now, fetch, facing !== null).catch(() => null)
    const prev = e.choice ?? readChoice(key)
    const out = stationNowFrom(got ?? { stations: [], readings: [] }, facing, now, prev)
    e.choice = out.choice
    if (out.choice !== prev) keepChoice(key, out.choice)
    e.value = out.value
    for (const l of e.listeners) l()
  } finally {
    e.asking = false
  }
}

function entryFor(key: string, spot: LatLon): Entry {
  let e = entries.get(key)
  if (e === undefined) {
    e = { spot, value: null, askedAt: 0, asking: false, facing: undefined, choice: null, listeners: new Set(), timer: null }
    entries.set(key, e)
  }
  return e
}

function subscribe(key: string, spot: LatLon, l: () => void): () => void {
  const e = entryFor(key, spot)
  e.listeners.add(l)
  if (e.timer === null) {
    if (Date.now() - e.askedAt >= ASK_EVERY_MS) void ask(key, e)
    e.timer = setInterval(() => void ask(key, e), ASK_EVERY_MS)
  }
  return () => {
    e.listeners.delete(l)
    if (e.listeners.size === 0 && e.timer !== null) {
      clearInterval(e.timer)
      e.timer = null
    }
  }
}

const NOOP = (): void => undefined

/** The one station now at the spot, the same for every screen; null until a load has come back, or when no station is fresh. */
export function useStationObs(spot: LatLon | null): StationNow | null {
  const key = spot === null ? null : spotKeyOf(spot)
  const lat = spot?.lat ?? 0
  const lon = spot?.lon ?? 0
  const sub = useCallback((l: () => void) => (key === null ? NOOP : subscribe(key, { lat, lon }, l)), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(
    sub,
    () => (key === null ? null : (entries.get(key)?.value ?? null)),
    () => null,
  )
}

/** Batch SIMPLE-3, Section 0: whether the spot's station has been asked and has answered (a station or none), so a screen can wait for it rather than draw a call it is about to change. */
export function stationObsAnswered(spot: LatLon | null): boolean {
  if (spot === null) return true
  const e = entries.get(spotKeyOf(spot))
  return e !== undefined && e.askedAt > 0 && !e.asking
}

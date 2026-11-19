/*
 * WHERE'S THE COLOR, KEPT 30 MINUTES (18 Nov, after Batch SIMPLE-1, Section 4b).
 *
 * The grid is 7 of a home open's 14 Open-Meteo questions and 175 of its ~224
 * billed calls (measurements/2026-11-18-bestsky-on-page.md). It is asked only
 * when the Best Sky page is opened (src/components/BestSkyPage.tsx); the
 * answer is kept here 30 minutes, and the home's "better color" lines read
 * it from here and never ask (src/components/Home.tsx useKeptBestSky).
 *
 * One entry, this phone's localStorage, under "scoutngo." so Privacy › Clear
 * this phone removes it. It holds the spot rounded to two decimals and the
 * forecast's cloud on the grid; the coordinate never leaves the phone.
 */
import { useEffect, useMemo, useState } from 'react'
import type { RadiusMi, RankedSpot, ScoredPoint } from '../core/bestSky.ts'
import type { LatLon } from '../core/geo.ts'
import type { Drift } from '../core/satDrift.ts'
import { nextColorEvent, type BestSky } from './useBestSky.ts'

export const BEST_SKY_KEPT_KEY = 'scoutngo.bestSkyKept.v1'
export const BEST_SKY_KEEP_MS = 30 * 60_000
const CHANGED = 'scoutngo:bestsky-kept'

/** What one asking of the grid found, before the spots are ranked. */
export interface BestSkyGot {
  grid: ScoredPoint[]
  asked: number
  satAt: Date | null
  satAsked: boolean
  failed: boolean
  drift: Drift | null
  station: BestSky['station']
}

interface Entry {
  /** The spot (2 decimals) and the event, the radius apart: what the home matches on. */
  place: string
  radius: number
  at: number
  got: Omit<BestSkyGot, 'satAt'> & { satAt: number | null }
  ranked: RankedSpot[]
  here: ScoredPoint | null
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const placeKey = (spot: LatLon, event: Date): string => `${spot.lat.toFixed(2)},${spot.lon.toFixed(2)}|${event.getTime()}`

function read(store: Store | null): Entry | null {
  if (store === null) return null
  try {
    const e = JSON.parse(store.getItem(BEST_SKY_KEPT_KEY) ?? 'null') as Entry | null
    return e !== null && typeof e === 'object' && typeof e.place === 'string' && typeof e.at === 'number' && Array.isArray(e.got?.grid) && Array.isArray(e.ranked) ? e : null
  } catch {
    return null
  }
}

const fresh = (e: Entry, now: number): boolean => now - e.at >= 0 && now - e.at < BEST_SKY_KEEP_MS

/** The page's kept answer for this place, event and radius, if under 30 minutes old. */
export function keptGot(place: string, radius: RadiusMi, now: number, store: Store | null = local()): BestSkyGot | null {
  const e = read(store)
  if (e === null || e.place !== place || e.radius !== radius || !fresh(e, now)) return null
  return { ...e.got, satAt: e.got.satAt === null ? null : new Date(e.got.satAt) }
}

/** Keep what the page found. A failed asking is never kept, so the next opening asks again. */
export function keepBestSky(place: string, radius: RadiusMi, got: BestSkyGot, ranked: readonly RankedSpot[], here: ScoredPoint | null, now: number, store: Store | null = local()): void {
  if (store === null || got.failed) return
  const old = read(store)
  /* The same answer re-ranked (the map's spots arriving) keeps its own time: 30 minutes from the asking, not from the last draw. */
  const at = old !== null && old.place === place && old.radius === radius && fresh(old, now) ? old.at : now
  try {
    const entry: Entry = { place, radius, at, got: { ...got, satAt: got.satAt === null ? null : got.satAt.getTime() }, ranked: [...ranked], here }
    store.setItem(BEST_SKY_KEPT_KEY, JSON.stringify(entry))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
  } catch {
    /* full or blocked: the home just goes without the line */
  }
}

/**
 * The home's view: the page's kept answer for the next colour here, or nothing. Never asks.
 * `now` picks the event (the home's clock, which holds to the minute); `clock` is the real time the 30 minutes run on.
 */
export function keptBestSky(spot: LatLon, now: Date, store: Store | null = local(), clock: number = Date.now()): Pick<BestSky, 'event' | 'ranked' | 'here'> {
  const event = nextColorEvent(spot, now)
  const e = read(store)
  if (event === null || e === null || e.place !== placeKey(spot, event.at) || !fresh(e, clock)) return { event: null, ranked: [], here: null }
  return { event, ranked: e.ranked, here: e.here }
}

export function useKeptBestSky(spot: LatLon | null, now: Date): Pick<BestSky, 'event' | 'ranked' | 'here'> {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const again = () => setTick((t) => t + 1)
    window.addEventListener(CHANGED, again)
    window.addEventListener('storage', again)
    return () => {
      window.removeEventListener(CHANGED, again)
      window.removeEventListener('storage', again)
    }
  }, [])
  const minute = Math.floor(now.getTime() / 60_000)
  return useMemo(() => (spot === null ? { event: null, ranked: [], here: null } : keptBestSky(spot, new Date(minute * 60_000))), [spot?.lat, spot?.lon, minute, tick]) // eslint-disable-line react-hooks/exhaustive-deps
}

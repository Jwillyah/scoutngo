import { retrying } from './retrying.ts'
import { useEffect, useSyncExternalStore } from 'react'
import type { LatLon } from '../core/geo.ts'
import {
  nearestStations,
  openCoastFirst,
  STATION_USABLE_KM,
  type TideStation,
} from '../core/tide.ts'
import { fetchPredictions, fetchStations, type TidePredictions } from './noaa.ts'
import { coastFacing } from './coast.ts'

/**
 * Tide for the venue, or a plain statement of why there is none.
 *
 * EVERY FAILURE IS A STATE, not a blank. Inland venues have no station, NOAA
 * goes down, a station publishes nothing for a date. Each of those is something
 * the shooter should be told in words, because a silent empty panel reads as a
 * bug and invites the assumption that tide does not matter here.
 */
export type TideInfo =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ok'
      station: TideStation
      distanceKm: number
      /** True when the station is further than STATION_LOCAL_KM but still usable. */
      distant: boolean
      predictions: TidePredictions
    }
  /** A station exists but is too far to describe this water. */
  | { status: 'no-station'; nearestKm: number; nearestName: string }
  | { status: 'unavailable'; reason: string }

/** The coast's answer is waited on at most this long before the station is chosen. */
export const COAST_WAIT_MS = 4000
const spotKey = (p: LatLon) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`
const beaches = new Map<string, Promise<LatLon | null>>()
/** The ocean beach a sound-side pin takes its tide from, or null: one answer per spot for every screen. */
export function beachFor(at: LatLon): Promise<LatLon | null> {
  const k = spotKey(at)
  const had = beaches.get(k)
  if (had !== undefined) return had
  const p = Promise.race([
    coastFacing(at)
      .then((c) => (typeof c === 'object' && c.side === 'island' && c.beachAt !== undefined ? c.beachAt : null))
      .catch(() => null),
    new Promise<null>((done) => setTimeout(() => done(null), COAST_WAIT_MS)),
  ])
  beaches.set(k, p)
  return p
}
/** The station a spot's tide comes from, once one has answered: the home, the map and the Tide page say the same. */
const chosen = new Map<string, string>()
export const chosenFor = (at: LatLon): string | null => chosen.get(spotKey(at)) ?? null

/** How many stations to try before giving up. See the loop below. */
export const STATION_ATTEMPTS = 3

/*
 * ONE TIDE PER SPOT AND DAY (Batch SIMPLE-3, Section 0). Every screen's
 * useTide asked again from 'loading' on each mount, so the home mounted again
 * (Back from a page, the spot search closed) said "Tide —" for a few seconds
 * while the Surf page beside it had the table. The answer is kept here, once
 * per spot and day, for every screen; the asking belongs to the spot, not to
 * the screen that happened to ask first.
 */
const tides = new Map<string, TideInfo>()
const tideListeners = new Set<() => void>()
let tideVersion = 0
function putTide(key: string, info: TideInfo): void {
  tides.set(key, info)
  if (tides.size > 24) tides.delete(tides.keys().next().value as string)
  tideVersion += 1
  for (const l of [...tideListeners]) l()
}
const subscribeTide = (l: () => void) => {
  tideListeners.add(l)
  return () => tideListeners.delete(l)
}
const tideNow = () => tideVersion
/** For tests. */
export function clearTides(): void {
  tides.clear()
  tideVersion += 1
}

function askTide(key: string, lat: number, lon: number, shootAt: Date): void {
  if (tides.has(key)) return
  const setInfo = (info: TideInfo) => putTide(key, info)
  setInfo({ status: 'loading' })
  /* Asked again after a failure (src/lib/retrying.ts): true is finished, false is try again. */
  retrying(async () => {
    const stations = await fetchStations()
    if (stations.status !== 'ok') {
      setInfo({ status: 'unavailable', reason: stations.reason })
      return false
    }

    /*
     * Batch MAP2, Section 2: the open coast first among the nearest (a spot on the beach, not up a creek).
     * Batch Beach, Section 1: from the ocean beach, when the spot is on a barrier island's sound side (above).
     */
    const beach = await beachFor({ lat, lon })
    const from = beach ?? { lat, lon }
    const spot = spotKey({ lat, lon })
    const ordered = openCoastFirst(nearestStations(from, stations.stations, STATION_ATTEMPTS + 3)).slice(0, STATION_ATTEMPTS)
    const was = chosen.get(spot)
    const candidates = was === undefined ? ordered : [...ordered.filter((c) => c.station.id === was), ...ordered.filter((c) => c.station.id !== was)]
    const nearest = candidates[0]
    if (nearest === undefined) {
      setInfo({ status: 'unavailable', reason: 'NOAA listed no tide stations.' })
      return true
    }
    if (nearest.proximity === 'none') {
      setInfo({
        status: 'no-station',
        nearestKm: nearest.distanceKm,
        nearestName: nearest.station.name,
      })
      return true
    }

    /*
     * Nearest AND active. The closest station may publish nothing against the
     * MLLW datum, which is not a reason to tell a waterfront venue it has no
     * tide, so the next few are tried in order. Bounded, because this is a
     * shared public service and a venue with three dead stations around it is
     * genuinely a venue without usable predictions.
     */
    let lastReason = 'No nearby station published predictions for this date.'
    let unreachable = false
    for (const candidate of candidates) {
      if (candidate.proximity === 'none') break
      const predictions = await fetchPredictions(candidate.station.id, shootAt)
        if (predictions.status === 'ok') {
        chosen.set(spot, candidate.station.id)
        setInfo({
          status: 'ok',
          station: candidate.station,
          distanceKm: candidate.distanceKm,
          distant: candidate.proximity === 'distant',
          predictions: predictions.predictions,
        })
        return true
      }
      lastReason = predictions.reason
      if (predictions.status === 'unavailable' && predictions.unreachable === true) unreachable = true
    }
    setInfo({ status: 'unavailable', reason: lastReason })
    /* A station that publishes nothing will publish nothing on a second ask; a dropped request might answer. */
    return !unreachable
  })
}

export function useTide(venue: LatLon | null, shootAt: Date | null): TideInfo {
  /* Primitives, so a new object identity each render does not refetch. */
  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  const dayKey = shootAt === null ? null : shootAt.toISOString().slice(0, 10)
  const key = lat === null || lon === null || dayKey === null ? null : `${spotKey({ lat, lon })},${dayKey}`
  useSyncExternalStore(subscribeTide, tideNow, tideNow)

  /*
   * Batch Beach, Section 1: a pin on a barrier island's sound side takes its
   * tide from the ocean beach (src/lib/coast.ts). Batch CORE, Section 3.2: the
   * coast's answer is awaited (at most COAST_WAIT_MS, shared by every screen,
   * beachFor) before the station is chosen, and the station chosen for a spot
   * is the one every screen uses (chosenFor). On 15 Nov the map said "Low
   * 5:52p" (Rudee Heights, 8639214) and the home "Low 9:15 PM" (Buchanan
   * Creek entrance, 8638854) for one spot: two stations, each right for itself.
   *
   * shootAt is intentionally not a dependency: only the DAY changes which
   * predictions are needed, and depending on the instant would refetch on
   * every drag of the time scrubber.
   */
  useEffect(() => {
    if (key === null || lat === null || lon === null || shootAt === null) return
    askTide(key, lat, lon, shootAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (key === null) return { status: 'idle' }
  return tides.get(key) ?? { status: 'loading' }
}

/** How far a station may be and still be shown at all. Re-exported for the UI. */
export { STATION_USABLE_KM }

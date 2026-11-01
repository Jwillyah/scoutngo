import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { fetchStationSkies, type StationSky } from './skyFireData.ts'

/*
 * THE STATION IS THE TRUTH NEAR NOW (Batch E, 1 Nov). At the pier at 8:45 AM
 * the sky was scattered low and mid cumulus with thin cloud by the sun; the
 * Cloud chip said 0·1·3. A forecast is a grid-box guess; the nearest METAR is
 * what an observer saw this hour. So when the time on the bar is within
 * NEAR_MS of the real now, the Cloud chip and Sky fire say the station's
 * layers first and the forecast under them.
 *
 * WHAT LEAVES THE PHONE: weather.gov's points lookup (the venue to 2
 * decimals), its station list, and the latest observation of the nearest
 * station (src/lib/hosts.ts). Asked at most once per venue every CACHE_MS,
 * never offline.
 */
export const NEAR_MS = 2 * 3_600_000
const CACHE_MS = 10 * 60_000
const cache = new Map<string, { at: number; sky: StationSky | null; pending?: Promise<StationSky | null> }>()

export const nearNow = (at: Date | null, now: number): boolean => at !== null && Math.abs(at.getTime() - now) <= NEAR_MS

export async function stationNow(venue: LatLon, now: number, fetchImpl: typeof fetch = fetch): Promise<StationSky | null> {
  const key = `${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}`
  const hit = cache.get(key)
  if (hit !== undefined && now - hit.at < CACHE_MS) return hit.pending ?? hit.sky
  const pending = fetchStationSkies(venue, fetchImpl, 1).then((list) => list[0] ?? null)
  cache.set(key, { at: now, sky: null, pending })
  const sky = await pending
  cache.set(key, { at: now, sky })
  return sky
}

/** The nearest station's latest sky when `at` is near now and the phone is online; else null. */
export function useStationNow(venue: LatLon | null, at: Date | null, online: boolean): StationSky | null {
  const [answer, setAnswer] = useState<{ key: string; sky: StationSky | null } | null>(null)
  const key = venue === null ? null : `${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}`
  /* To the minute: the bar moves by the second while scrubbing. */
  const minute = at === null ? null : Math.round(at.getTime() / 60_000)
  const askKey = key === null || minute === null || !online ? null : `${key}@${minute}`
  useEffect(() => {
    if (askKey === null || venue === null || minute === null) return
    let live = true
    /* Near now is decided here, against the clock as the effect runs, not on every render. */
    if (!nearNow(new Date(minute * 60_000), Date.now())) {
      void Promise.resolve().then(() => live && setAnswer({ key: askKey, sky: null }))
    } else {
      void stationNow(venue, Date.now()).then((sky) => {
        if (live) setAnswer({ key: askKey, sky })
      })
    }
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey])
  return answer !== null && answer.key === askKey ? answer.sky : null
}

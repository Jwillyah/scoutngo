import { useEffect, useMemo, useState } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import type { DeckTruth } from '../core/layerTruth.ts'
import type { MetarSky } from '../core/metar.ts'
import type { SatRead } from '../core/goesNowcast.ts'
import type { Layer } from '../core/skyColour.ts'
import { fetchSatRead } from './goesNowcast.ts'
import { fetchPireps, fetchProfile, fetchSounding, truthFrom, type Profile } from './skyObsData.ts'

/*
 * THE OBSERVATIONS BEFORE A SUNRISE OR SUNSET (Batch J), in one place for
 * Sky fire and Today: from OBS_FROM_MS before the event until it (after
 * it, the call is made and the log asks how it was), the pressure-level profile, the nearest sounding, the pilots'
 * reports near the nearest station, and the satellite along the sun's line.
 * Read into the deck over you by src/lib/skyObsData.ts truthFrom.
 */
export const OBS_FROM_MS = 3 * 3_600_000
export const OBS_AFTER_MS = 0

export const obsDue = (event: Date | null, now: Date): boolean => event !== null && event.getTime() - now.getTime() <= OBS_FROM_MS && now.getTime() - event.getTime() <= OBS_AFTER_MS

export interface SkyObs {
  truth: DeckTruth | null
  sat: SatRead | null
  profile: Profile | null
}

interface Got {
  key: string
  profile: Profile | null
  sounding: Awaited<ReturnType<typeof fetchSounding>>
  pireps: string[]
  sat: SatRead | null
}

/* One fetch per venue and event, shared by every page that asks (Sky fire, its strips, Today). */
const asked = new Map<string, Promise<Got>>()
function ask(key: string, venue: LatLon, event: Date, station: string | null): Promise<Got> {
  let p = asked.get(key)
  if (p === undefined) {
    p = (async () => {
      const profile = await fetchProfile(venue, event)
      const wind = profile?.wind700 ?? profile?.wind500 ?? null
      const [sounding, pireps, sat] = await Promise.all([
        fetchSounding(venue, event, new Date()),
        station === null ? Promise.resolve([]) : fetchPireps(station),
        fetchSatRead(venue, getPosition(event, venue.lat, venue.lon).azimuth, event, new Date(), wind, profile?.airC ?? null).catch(() => null),
      ])
      return { key, profile, sounding, pireps, sat }
    })()
    if (asked.size > 20) asked.clear()
    asked.set(key, p)
  }
  return p
}

/** Null outside the window, or while the first answers are out. */
export function useSkyObs(venue: LatLon | null, event: Date | null, station: { id: string; sky: MetarSky } | null, modelLayer: Layer | null, now: Date): SkyObs | null {
  const due = venue !== null && obsDue(event, now)
  const key = !due || venue === null || event === null ? null : `${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}@${event.getTime()}|${station?.id ?? ''}`
  const [got, setGot] = useState<Got | null>(null)
  useEffect(() => {
    if (key === null || venue === null || event === null) return
    let live = true
    void ask(key, venue, event, station?.id ?? null).then((g) => {
      if (live) setGot(g)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return useMemo(() => {
    if (key === null || got === null || got.key !== key) return null
    const truth = truthFrom({ station: station?.sky ?? null, pireps: got.pireps, sounding: got.sounding, profile: got.profile, sat: got.sat, modelLayer })
    return { truth, sat: got.sat, profile: got.profile }
  }, [key, got, station, modelLayer])
}

import { useEffect, useMemo, useState } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import type { DeckTruth } from '../core/layerTruth.ts'
import type { MetarSky } from '../core/metar.ts'
import type { SatRead } from '../core/goesNowcast.ts'
import type { Layer } from '../core/skyColour.ts'
import { fetchSatRead } from './goesNowcast.ts'
import { fetchEchoes, fetchLineSkies, fetchPireps, fetchProfile, fetchSounding, gapFrom, lineStations, truthFrom, type Profile } from './skyObsData.ts'
import { GAP_REACH_KM, type GapRead, type LineStation } from '../core/gapWatch.ts'
import { afdSkyLine, airRead, contrailsLikely, runsLine, type AirRead, type RunPath } from '../core/vivid.ts'
import { fetchAfd, fetchAir, fetchRecentRain, fetchRuns, type Afd } from './vividData.ts'

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

export interface Vivid {
  air: AirRead | null
  runs: { open: number; of: number; line: string } | null
  contrails: boolean
  /** NWS's discussion: context, never an input to the call. */
  afd: { office: string; issued: string; line: string | null } | null
}

export interface SkyObs {
  truth: DeckTruth | null
  /** The gap toward the sun (src/core/gapWatch.ts). */
  gap: GapRead
  /** How vivid (src/core/vivid.ts). */
  vivid: Vivid
  sat: SatRead | null
  profile: Profile | null
}

interface Got {
  key: string
  profile: Profile | null
  sounding: Awaited<ReturnType<typeof fetchSounding>>
  pireps: string[]
  sat: SatRead | null
  azimuthDeg: number
  line: LineStation[]
  reports: Map<string, MetarSky>
  echoesKm: number[] | null
  air: Awaited<ReturnType<typeof fetchAir>>
  rainMm: number | null
  runs: RunPath[] | null
  afd: Afd | null
}

/* One fetch per venue and event, shared by every page that asks (Sky fire, its strips, Today). */
const asked = new Map<string, Promise<Got>>()
function ask(key: string, venue: LatLon, event: Date, station: string | null): Promise<Got> {
  let p = asked.get(key)
  if (p === undefined) {
    p = (async () => {
      const azimuthDeg = getPosition(event, venue.lat, venue.lon).azimuth
      const [profile, line] = await Promise.all([fetchProfile(venue, event), lineStations(venue, azimuthDeg).catch(() => [])])
      const wind = profile?.wind700 ?? profile?.wind500 ?? null
      const [sounding, pireps, sat, reports, echoesKm, air, rainMm, runs, afd] = await Promise.all([
        fetchSounding(venue, event, new Date()),
        station === null ? Promise.resolve([]) : fetchPireps(station),
        fetchSatRead(venue, azimuthDeg, event, new Date(), wind, profile?.airC ?? null).catch(() => null),
        fetchLineSkies(line.slice(0, 12).map((s) => s.id)),
        fetchEchoes(venue, azimuthDeg, GAP_REACH_KM).catch(() => null),
        fetchAir(venue, event).catch(() => null),
        fetchRecentRain(venue, new Date()).catch(() => null),
        fetchRuns(venue, azimuthDeg, event).catch(() => null),
        fetchAfd(venue).catch(() => null),
      ])
      return { key, profile, sounding, pireps, sat, azimuthDeg, line, reports, echoesKm, air, rainMm, runs, afd }
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
    const gap = gapFrom({ azimuthDeg: got.azimuthDeg, line: got.line, reports: got.reports, station: station?.sky ?? null, sat: got.sat, echoesKm: got.echoesKm })
    const vivid: Vivid = {
      air: got.air === null ? null : airRead(got.air.aod, got.air.dust, got.air.pm25, got.rainMm),
      runs: got.runs === null ? null : runsLine(got.runs),
      contrails: got.profile !== null && contrailsLikely(got.profile.levels),
      afd: got.afd === null ? null : { office: got.afd.office, issued: got.afd.issued, line: afdSkyLine(got.afd.text) },
    }
    return { truth, gap, vivid, sat: got.sat, profile: got.profile }
  }, [key, got, station, modelLayer])
}

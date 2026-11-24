/*
 * WHAT THE SURF PAGE v2 READS (Batch N, Section 1), all through the fetchers
 * the old Surf page and the home already use, so nothing new is asked:
 *
 *   marine   Open-Meteo Marine, the week (fetchMarine, the weather store)
 *   wind     the briefing's wind, the week (fetchBriefWind, the same store)
 *   facing   which way the beach faces (the map's sea polygons)
 *   factor   the region's beach factor (src/core/beachFactor.ts), from the spot itself
 *   buoy     the nearest NDBC buoy on that water, its latest reading
 *            (/api/buoy, sent only a station number)
 *
 * Coordinates are rounded to 2 decimals by the fetchers; the buoy is picked
 * on the phone. Nothing about the user leaves it.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { factorHere, jettyHere } from './beachFactorHere.ts'
import type { Shelter } from '../core/jettyFactor.ts'
import { readReports, REPORTS_CHANGED } from './fieldReportStore.ts'
import type { LatLon } from '../core/geo.ts'
import { latestBuoys, type BuoyReading } from './buoy.ts'
import { coastFacing } from './coast.ts'
import { fetchBriefWind, fetchMarine, type Hourly } from './tideSheetData.ts'
import { retrying } from './retrying.ts'
import type { ModelSea } from './waveModels.ts'
import { useWeatherEpoch } from './useWeatherStatus.ts'

export interface SurfSea {
  /** 'loading' until the forecasts have answered (or failed). */
  status: 'loading' | 'ready'
  marine: Hourly | null
  wind: Hourly | null
  /** The beach's seaward facing, degrees; null while unknown, inland, or unavailable. */
  facing: number | null
  /** 'inland': the map has no sea here. */
  facingState: 'loading' | 'ok' | 'inland' | 'unavailable'
  buoy: BuoyReading | null
  /** Batch LIVE, Section 9A: every nearby buoy on the same water that answered, the nowcast's check on the nearest. */
  buoys?: BuoyReading[]
  /** The region's beach factor (src/core/beachFactor.ts); absent: BEACH_CAP. */
  factor?: number
  /** Batch DRONE, Section 1.3: a jetty's lee (src/core/jettyFactor.ts); absent or null on an open beach. */
  shelter?: Shelter | null
  /** Batch 3D, Section 3.2: the other wave models, for the bigger-swell watch only (src/lib/waveModels.ts); absent where the screen did not ask. */
  models?: ModelSea[]
  /** Batch SIMPLE-3, Section 0: the nearest buoy has been asked once (answered or not). */
  buoyAsked?: boolean
}

/** Batch SIMPLE-3, Section 0: the forecasts, the facing and the buoy have each answered (or said why not): the surf can be called without a second, different answer coming. */
export const seaSettled = (s: SurfSea): boolean => s.status === 'ready' && s.facingState !== 'loading' && s.buoyAsked === true

const EMPTY: SurfSea = {
  status: 'loading',
  marine: null,
  wind: null,
  facing: null,
  facingState: 'loading',
  buoy: null,
}

/*
 * ONE SEA PER SPOT (Batch SIMPLE-3, Section 0). Each screen's useSurfSea kept
 * its own copy and asked on its own, so the home mounted again (Back from a
 * page, the spot search closed) started from nothing: the size was read with
 * no facing and no buoy for a second ("4–6 ft Fun"), then again with them
 * ("3–4 ft Rideable"). What has answered for a spot lives here, once; a
 * screen opened later reads it at once, and `settled` says when the
 * forecasts, the facing and the buoy have all answered (or said why not).
 */
const seas = new Map<string, SurfSea>()
const seaAsked = new Map<string, number>()
const seaListeners = new Set<() => void>()
let seaVersion = 0
function putSea(key: string, patch: Partial<SurfSea>): void {
  seas.set(key, { ...(seas.get(key) ?? EMPTY), ...patch })
  seaVersion += 1
  for (const l of [...seaListeners]) l()
}
const subscribeSea = (l: () => void) => {
  seaListeners.add(l)
  return () => seaListeners.delete(l)
}
const seaNowVersion = () => seaVersion
/** For tests. */
export function clearSurfSeas(): void {
  seas.clear()
  seaAsked.clear()
  seaVersion += 1
}
export function putSurfSea(spot: LatLon, patch: Partial<SurfSea>): void {
  putSea(`${spot.lat.toFixed(3)},${spot.lon.toFixed(3)}`, patch)
}

export function useSurfSea(spot: LatLon | null): SurfSea {
  const lat = spot?.lat ?? null
  const lon = spot?.lon ?? null
  const key = lat === null || lon === null ? null : `${lat.toFixed(3)},${lon.toFixed(3)}`
  const epoch = useWeatherEpoch()
  const version = useSyncExternalStore(subscribeSea, seaNowVersion, seaNowVersion)

  useEffect(() => {
    if (key === null || lat === null || lon === null || seaAsked.get(key) === epoch) return
    seaAsked.set(key, epoch)
    const at = { lat, lon }
    const put = (patch: Partial<SurfSea>) => putSea(key, patch)
    /*
     * Batch Map A3/A4: asked again (5 s, 20 s, 60 s, and when the network
     * comes back: src/lib/retrying.ts) until the sea, the wind and the buoy
     * have all answered. What arrived stays on screen; a later try never
     * puts an empty answer over a good one. The asking is the spot's, not
     * the screen's: a screen closing does not stop it.
     */
    let facing: number | null | undefined = seas.get(key)?.facingState === 'ok' || seas.get(key)?.facingState === 'inland' ? (seas.get(key)?.facing ?? null) : undefined
    let gotBuoy = false
    retrying(async () => {
      const [m, w] = await Promise.all([fetchMarine(at).catch(() => null), fetchBriefWind(at).catch(() => null)])
      put({ status: 'ready', ...(m === null ? {} : { marine: m.value }), ...(w === null ? {} : { wind: w }) })
      if (facing === undefined) {
        const f = await coastFacing(at).catch(() => 'unavailable' as const)
        if (f !== 'unavailable') facing = f === 'inland' ? null : Math.round(f.facing)
        put({
          facing: facing ?? null,
          facingState: f === 'inland' ? 'inland' : f === 'unavailable' ? 'unavailable' : 'ok',
        })
      }
      const all = await latestBuoys(at, facing ?? null).catch(() => null)
      const buoy = all === null ? null : (all[0] ?? null)
      const buoyLost = buoy === null || (buoy.status === 'none' && buoy.reason === "The buoy didn't load.")
      if (!buoyLost) gotBuoy = true
      if (!buoyLost || !gotBuoy) put({ buoy, buoys: all ?? [] })
      put({ buoyAsked: true })
      return m !== null && w !== null && facing !== undefined && !buoyLost
    })
  }, [key, lat, lon, epoch])

  /* The spot's factor: your reports here, else the region's; read again when a report is saved. */
  const [reports, setReports] = useState(readReports)
  useEffect(() => {
    const on = () => setReports(readReports())
    window.addEventListener(REPORTS_CHANGED, on)
    return () => window.removeEventListener(REPORTS_CHANGED, on)
  }, [])
  const factor = useMemo(() => (lat === null || lon === null ? undefined : factorHere({ lat, lon }, reports)), [lat, lon, reports])
  const shelter = useMemo(() => (lat === null || lon === null ? null : (jettyHere({ lat, lon })?.shelter ?? null)), [lat, lon])
  const v = key === null ? EMPTY : (seas.get(key) ?? EMPTY)
  return useMemo(() => (factor === undefined ? v : { ...v, factor, shelter }), [v, factor, shelter, version]) // eslint-disable-line react-hooks/exhaustive-deps
}

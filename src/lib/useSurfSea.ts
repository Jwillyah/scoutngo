/*
 * WHAT THE SURF PAGE v2 READS (Batch N, Section 1), all through the fetchers
 * the old Surf page and the home already use, so nothing new is asked:
 *
 *   marine   Open-Meteo Marine, the week (fetchMarine, the weather store)
 *   wind     the briefing's wind, the week (fetchBriefWind, the same store)
 *   facing   which way the beach faces (the map's sea polygons)
 *   buoy     the nearest NDBC buoy on that water, its latest reading
 *            (/api/buoy, sent only a station number)
 *
 * Coordinates are rounded to 2 decimals by the fetchers; the buoy is picked
 * on the phone. Nothing about the user leaves it.
 */
import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { latestBuoyWaves, type BuoyReading } from './buoy.ts'
import { coastFacing } from './coast.ts'
import { fetchBriefWind, fetchMarine, type Hourly } from './tideSheetData.ts'
import { retrying } from './retrying.ts'
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
}

const EMPTY: SurfSea = {
  status: 'loading',
  marine: null,
  wind: null,
  facing: null,
  facingState: 'loading',
  buoy: null,
}

export function useSurfSea(spot: LatLon | null): SurfSea {
  const lat = spot?.lat ?? null
  const lon = spot?.lon ?? null
  const key = lat === null || lon === null ? null : `${lat.toFixed(3)},${lon.toFixed(3)}`
  const epoch = useWeatherEpoch()
  const [sea, setSea] = useState<{ key: string; v: SurfSea } | null>(null)

  useEffect(() => {
    if (key === null || lat === null || lon === null) return
    const at = { lat, lon }
    let live = true
    const put = (patch: Partial<SurfSea>) => {
      if (live)
        setSea((prev) => ({
          key,
          v: { ...(prev?.key === key ? prev.v : EMPTY), ...patch },
        }))
    }
    /*
     * Batch Map A3/A4: asked again (5 s, 20 s, 60 s, and when the network
     * comes back: src/lib/retrying.ts) until the sea, the wind and the buoy
     * have all answered. What arrived stays on screen; a later try never
     * puts an empty answer over a good one.
     */
    let facing: number | null | undefined
    let gotBuoy = false
    const stop = retrying(async () => {
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
      const buoy = await latestBuoyWaves(at, facing ?? null).catch(() => null)
      const buoyLost = buoy === null || (buoy.status === 'none' && buoy.reason === "The buoy didn't load.")
      if (!buoyLost) gotBuoy = true
      if (!buoyLost || !gotBuoy) put({ buoy })
      return m !== null && w !== null && facing !== undefined && !buoyLost
    })
    return () => {
      live = false
      stop()
    }
  }, [key, lat, lon, epoch])

  return sea !== null && sea.key === key ? sea.v : EMPTY
}

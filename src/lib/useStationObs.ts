/*
 * THE STATION NEAR THE SPOT, NOW (Batch MAP2, Section 2). An airport station
 * (ASOS/AWOS, the bundled list) within 15 km of the spot, and its latest
 * report when it is under an hour old: what src/core/nowcast.ts leans "now"
 * toward. Only the station's id is asked (src/lib/stationNear.ts); again
 * every 10 minutes while a screen shows it.
 */
import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { NOWCAST_STATION_KM, type StationObs } from '../core/nowcast.ts'
import type { MetarSky } from '../core/metar.ts'
import { metarVisMiles } from '../core/skyWord.ts'
import { nearestStation, stationReport, stationWind } from './stationNear.ts'

const KT = 0.514444

export interface StationNow extends StationObs {
  id: string
  /** The same report's sky and visibility, for the one sky word (src/core/skyWord.ts). */
  sky: MetarSky | null
  visMi: number | null
}

export function useStationObs(spot: LatLon | null): StationNow | null {
  const [obs, setObs] = useState<{ key: string; v: StationNow | null } | null>(null)
  const key = spot === null ? null : `${spot.lat.toFixed(2)},${spot.lon.toFixed(2)}`
  useEffect(() => {
    if (spot === null || key === null) return
    let live = true
    const ask = async () => {
      const s = await nearestStation(spot, NOWCAST_STATION_KM).catch(() => null)
      if (s === null) {
        if (live) setObs({ key, v: null })
        return
      }
      const w = await stationWind(s.id).catch(() => null)
      const r = await stationReport(s.id).catch(() => null)
      const at = w === null ? null : new Date(w.at)
      if (live) setObs({ key, v: w === null || at === null || !Number.isFinite(at.getTime()) ? null : { id: s.id, at, mps: w.kt * KT, fromDeg: w.fromDeg, gustMps: w.gustKt === null ? null : w.gustKt * KT, sky: r?.sky ?? null, visMi: r === null ? null : metarVisMiles(r.raw) } })
    }
    void ask()
    const t = setInterval(() => void ask(), 10 * 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return obs !== null && obs.key === key ? obs.v : null
}

/*
 * THE STATION NEAR THE SPOT, NOW (Batch MAP2, Section 2; Batch TRUTH,
 * Section 3). The freshest of the nearest three stations within 30 km,
 * airports and NOAA's coastal stations alike (src/lib/nearWind.ts), when
 * under 75 minutes old: what src/core/nowcast.ts leans "now" toward and what
 * the Wind page says. The sky and visibility for the one sky word come from
 * the freshest airport report among them. Only station ids are asked; again
 * every 10 minutes while a screen shows it.
 */
import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { StationObs } from '../core/nowcast.ts'
import type { MetarSky } from '../core/metar.ts'
import { freshest, nearWind, type NearStation } from './nearWind.ts'

const KT = 0.514444

export interface StationNow extends StationObs {
  id: string
  /** What the page calls it: "KNTU", "Cape Henry". */
  label: string
  kind: NearStation['kind']
  km: number
  /** The freshest airport report's sky and visibility, for the one sky word (src/core/skyWord.ts). */
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
      const now = new Date()
      const got = await nearWind(spot, now).catch(() => null)
      const best = got?.best ?? null
      const air = got === null ? null : freshest(got.readings.filter((r) => r?.station.kind === 'airport'), now)
      if (live)
        setObs({
          key,
          v:
            best === null
              ? null
              : { id: best.station.id, label: best.station.label, kind: best.station.kind, km: best.station.km, at: best.at, mps: best.kt * KT, fromDeg: best.fromDeg, gustMps: best.gustKt === null ? null : best.gustKt * KT, sky: air?.sky ?? null, visMi: air?.visMi ?? null },
        })
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

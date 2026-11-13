/*
 * THE STATION NEAR THE SPOT, NOW (Batch MAP2, Section 2; Batch TRUTH,
 * Section 3). The freshest of the nearest three stations within 30 km,
 * airports and NOAA's coastal stations alike (src/lib/nearWind.ts), when
 * under 75 minutes old: what src/core/nowcast.ts leans "now" toward and what
 * the Wind page says. The sky and visibility for the one sky word come from
 * the nearest airport among them whose report is fresh (Batch NOW, Section
 * 1.3: by the station, not by the wind's pick, so the same station is the
 * same word), with its own time. Only station ids are asked; again
 * every 10 minutes while a screen shows it.
 */
import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { StationObs } from '../core/nowcast.ts'
import type { MetarSky } from '../core/metar.ts'
import { coastFacing } from './coast.ts'
import { MAX_AGE_MS, nearestFresh, nearWind, type NearReading, type NearStation } from './nearWind.ts'
import { normalizeWind, stationOrder, type Normalized } from '../core/stationWind.ts'

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
}

/** The beach's facing, or null inland; waits at most FACING_WAIT_MS (the sea polygons can take seconds on a slow link). */
const FACING_WAIT_MS = 4000
async function facingOf(spot: LatLon): Promise<number | null> {
  const f = await Promise.race([coastFacing(spot).catch(() => 'unavailable' as const), new Promise<'unavailable'>((r) => setTimeout(() => r('unavailable'), FACING_WAIT_MS))])
  return f === 'inland' || f === 'unavailable' ? null : f.facing
}

export function useStationObs(spot: LatLon | null): StationNow | null {
  const [obs, setObs] = useState<{ key: string; v: StationNow | null } | null>(null)
  const key = spot === null ? null : `${spot.lat.toFixed(2)},${spot.lon.toFixed(2)}`
  useEffect(() => {
    if (spot === null || key === null) return
    let live = true
    const ask = async () => {
      const now = new Date()
      const facing = await facingOf(spot)
      const got = await nearWind(spot, now, fetch, facing !== null).catch(() => null)
      const best = got?.best ?? null
      const norm = best === null ? null : normalizeWind({ id: best.station.id, kind: best.station.kind, mps: best.kt * KT, gustMps: best.gustKt === null ? null : best.gustKt * KT, fromDeg: best.fromDeg }, facing)
      const coastRead = facing === null || got === null ? null : (stationOrder(got.readings.filter((r): r is NearReading => r !== null && r.station.kind === 'coastal' && now.getTime() - r.at.getTime() <= MAX_AGE_MS), true)[0] ?? null)
      const coastNorm = coastRead === null ? null : normalizeWind({ id: coastRead.station.id, kind: 'coastal', mps: coastRead.kt * KT, gustMps: null, fromDeg: coastRead.fromDeg }, facing)
      const air = got === null ? null : nearestFresh(got.readings.filter((r) => r?.station.kind === 'airport'), now)
      if (live)
        setObs({
          key,
          v:
            best === null || norm === null
              ? null
              : {
                  id: best.station.id,
                  label: best.station.label,
                  kind: best.station.kind,
                  km: best.station.km,
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
                },
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

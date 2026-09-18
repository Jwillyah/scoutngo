import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import {
  nearestStations,
  STATION_USABLE_KM,
  type TideStation,
} from '../core/tide.ts'
import { fetchPredictions, fetchStations, type TidePredictions } from './noaa.ts'

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

/** How many stations to try before giving up. See the loop below. */
export const STATION_ATTEMPTS = 3

export function useTide(venue: LatLon | null, shootAt: Date | null): TideInfo {
  const [info, setInfo] = useState<TideInfo>({ status: 'idle' })

  /* Primitives, so a new object identity each render does not refetch. */
  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  const dayKey = shootAt === null ? null : shootAt.toISOString().slice(0, 10)

  useEffect(() => {
    if (lat === null || lon === null || dayKey === null || shootAt === null) {
      setInfo({ status: 'idle' })
      return
    }

    let live = true
    setInfo({ status: 'loading' })

    void (async () => {
      const stations = await fetchStations()
      if (!live) return
      if (stations.status !== 'ok') {
        setInfo({ status: 'unavailable', reason: stations.reason })
        return
      }

      const candidates = nearestStations({ lat, lon }, stations.stations, STATION_ATTEMPTS)
      const nearest = candidates[0]
      if (nearest === undefined) {
        setInfo({ status: 'unavailable', reason: 'NOAA listed no tide stations.' })
        return
      }
      if (nearest.proximity === 'none') {
        setInfo({
          status: 'no-station',
          nearestKm: nearest.distanceKm,
          nearestName: nearest.station.name,
        })
        return
      }

      /*
       * Nearest AND active. The closest station may publish nothing against the
       * MLLW datum, which is not a reason to tell a waterfront venue it has no
       * tide, so the next few are tried in order. Bounded, because this is a
       * shared public service and a venue with three dead stations around it is
       * genuinely a venue without usable predictions.
       */
      let lastReason = 'No nearby station published predictions for this date.'
      for (const candidate of candidates) {
        if (candidate.proximity === 'none') break
        const predictions = await fetchPredictions(candidate.station.id, shootAt)
        if (!live) return
        if (predictions.status === 'ok') {
          setInfo({
            status: 'ok',
            station: candidate.station,
            distanceKm: candidate.distanceKm,
            distant: candidate.proximity === 'distant',
            predictions: predictions.predictions,
          })
          return
        }
        lastReason = predictions.reason
      }
      setInfo({ status: 'unavailable', reason: lastReason })
    })()

    return () => {
      live = false
    }
    /*
     * shootAt is intentionally not a dependency: only the DAY changes which
     * predictions are needed, and depending on the instant would refetch on
     * every drag of the time scrubber.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, dayKey])

  return info
}

/** How far a station may be and still be shown at all. Re-exported for the UI. */
export { STATION_USABLE_KM }

import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { Wind } from '../core/upwind.ts'
import { fetchWind } from './forecast.ts'

/**
 * Wind at the venue, for the hour the shoot is in.
 *
 * TWO THINGS WANT IT. Anyone flying, for whom the speed and the gust decide
 * whether the aircraft goes up, and the cam ranking, which needs the direction
 * to work out which camera is showing what is coming.
 *
 * Keyed on the venue rounded to three decimals and the HOUR, not the instant:
 * the scrubber moves continuously and a wind lookup per drag frame would hammer
 * a free service for a number that changes hourly.
 *
 * EVERY FAILURE IS NULL, not an error. The wind is useful and not essential:
 * without it the cam list says it is showing nearest first rather than claiming
 * a ranking it could not compute.
 */
export interface WindState {
  wind: Wind | null
  gustMps: number | null
}

export function useWind(
  venue: LatLon | null,
  at: Date | null,
  timeZone: string | null,
): WindState {
  const [state, setState] = useState<WindState>({ wind: null, gustMps: null })

  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  /* The hour, so dragging the scrubber inside one hour refetches nothing. */
  const hourKey = at === null ? null : `${at.toDateString()}|${at.getHours()}`

  useEffect(() => {
    if (lat === null || lon === null || at === null || timeZone === null) {
      setState({ wind: null, gustMps: null })
      return
    }
    let live = true
    void fetchWind({ lat, lon }, at, timeZone).then((result) => {
      if (!live) return
      setState(
        result.status === 'ok'
          ? { wind: result.wind, gustMps: result.gustMps }
          : { wind: null, gustMps: null },
      )
    })
    return () => {
      live = false
    }
    /*
     * `at` is deliberately not a dependency: only the HOUR changes the answer,
     * and depending on the instant would refetch on every scrubber frame.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, hourKey, timeZone])

  return state
}

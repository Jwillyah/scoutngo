import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { Wind } from '../core/upwind.ts'
import type { LevelWind } from '../core/windProfile.ts'
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
  /** Ground wind, for when there is no air position to interpolate to. */
  wind: Wind | null
  /** All four served heights, for src/core/windProfile.ts. */
  levels: LevelWind[]
  /** The gust, at ten metres only. Open-Meteo serves none above the surface. */
  gustMps: number | null
  /** The hour the figures are for, which is the scrubbed hour and not now. */
  at: Date | null
  /**
   * Whether that hour is in the past.
   *
   * Open-Meteo blends its own analysis for past hours with forecast for
   * future ones, so a reading behind the current hour is much closer to what
   * happened. The panel says which, because "observed" and "a model's guess
   * four days out" are different claims.
   */
  past: boolean
}

export function useWind(
  venue: LatLon | null,
  at: Date | null,
  timeZone: string | null,
): WindState {
  const [state, setState] = useState<WindState>({
    wind: null,
    levels: [],
    gustMps: null,
    at: null,
    past: false,
  })

  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  /* The hour, so dragging the scrubber inside one hour refetches nothing. */
  const hourKey = at === null ? null : `${at.toDateString()}|${at.getHours()}`

  useEffect(() => {
    if (lat === null || lon === null || at === null || timeZone === null) {
      setState({ wind: null, levels: [], gustMps: null, at: null, past: false })
      return
    }
    let live = true
    void fetchWind({ lat, lon }, at, timeZone).then((result) => {
      if (!live) return
      setState(
        result.status === 'ok'
          ? {
              wind: result.wind,
              levels: result.levels,
              gustMps: result.gustMps,
              at: result.at,
              /* An hour already finished is behind the clock, not ahead of it. */
              past: result.at.getTime() < Date.now(),
            }
          : { wind: null, levels: [], gustMps: null, at: null, past: false },
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

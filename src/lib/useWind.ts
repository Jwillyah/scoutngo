import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { Wind } from '../core/upwind.ts'
import type { LevelWind } from '../core/windProfile.ts'
import { fetchVenueDay, parseVenueCloud, parseWind, venueClock, type VenueCloud } from './forecast.ts'
import { reportNetwork } from './offlineCache.ts'
import { retrying } from './retrying.ts'
import { readForecast, saveForecast, venueDayKey, type Provenance } from './savedForecast.ts'

/**
 * Wind and cloud at the venue, for the hour the shoot is in.
 *
 * TWO THINGS WANT THE WIND. Anyone flying, for whom the speed and the gust
 * decide whether the aircraft goes up, and the cam ranking, which needs the
 * direction to work out which camera is showing what is coming. The CLOUD
 * chip wants the cloud, which arrives in the same answer.
 *
 * Keyed on the venue rounded to three decimals and the HOUR, not the instant:
 * the scrubber moves continuously and a wind lookup per drag frame would hammer
 * a free service for a number that changes hourly.
 *
 * WITH NO SIGNAL, THE LAST ANSWER, AND ITS AGE. Every answer that arrives is
 * kept for the venue and the day (src/lib/savedForecast.ts). When the request
 * fails, the saved day is read instead and `provenance` says so, with the time
 * it arrived. When there is nothing saved either, `reason` says why in words:
 * the card says it, it does not blank.
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
  /** Cloud over the venue for the same hour. Null when none arrived. */
  cloud: VenueCloud | null
  /** Live, or saved with the time it arrived. */
  provenance: Provenance
  /** Why there is nothing, when there is nothing. Null while waiting or when ok. */
  reason: string | null
}

const EMPTY: WindState = {
  wind: null,
  levels: [],
  gustMps: null,
  at: null,
  past: false,
  cloud: null,
  provenance: { kind: 'live' },
  reason: null,
}

function fromPayload(
  payload: unknown,
  at: Date,
  timeZone: string,
  provenance: Provenance,
): WindState {
  const wind = parseWind(payload, at, timeZone)
  const cloud = parseVenueCloud(payload, at, timeZone)
  if (wind.status !== 'ok') {
    return { ...EMPTY, cloud, provenance, reason: wind.reason }
  }
  return {
    wind: wind.wind,
    levels: wind.levels,
    gustMps: wind.gustMps,
    at: wind.at,
    /* An hour already finished is behind the clock, not ahead of it. */
    past: wind.at.getTime() < Date.now(),
    cloud,
    provenance,
    reason: null,
  }
}

export function useWind(
  venue: LatLon | null,
  at: Date | null,
  timeZone: string | null,
): WindState {
  const [state, setState] = useState<WindState>(EMPTY)

  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  /* The hour, so dragging the scrubber inside one hour refetches nothing. */
  // clock-audit: data, a cache key per hour
  const hourKey = at === null ? null : `${at.toDateString()}|${at.getHours()}`

  useEffect(() => {
    if (lat === null || lon === null || at === null || timeZone === null) {
      setState(EMPTY)
      return
    }
    /* The venue's own date: the same one the request asks for. */
    const key = venueDayKey(lat, lon, venueClock(at, timeZone).date, timeZone)
    /* Asked again after a failure that a second try could change (src/lib/retrying.ts). */
    return retrying(async () => {
      const result = await fetchVenueDay({ lat, lon }, at, timeZone)
      if (result.status === 'ok') {
        reportNetwork(true)
        saveForecast(key, result.payload)
        setState(fromPayload(result.payload, at, timeZone, { kind: 'live' }))
        return true
      }
      if (result.unreachable === true) reportNetwork(false)
      const saved = readForecast(key)
      setState(
        saved === null
          ? {
              ...EMPTY,
              reason: `${result.reason} Nothing is saved for this venue and day.`,
            }
          : fromPayload(saved.payload, at, timeZone, { kind: 'saved', fetchedAt: saved.fetchedAt }),
      )
      return false
    })
    /*
     * `at` is deliberately not a dependency: only the HOUR changes the answer,
     * and depending on the instant would refetch on every scrubber frame.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, hourKey, timeZone])

  return state
}

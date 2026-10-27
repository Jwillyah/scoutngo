import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { TideExtreme } from '../core/tide.ts'
import { coastFacing, type CoastFacing } from './coast.ts'
import { retrying } from './retrying.ts'
import { fetchMarine, fetchMonthExtremes, fetchWindMonth, type Hourly } from './tideSheetData.ts'

/*
 * WHAT THE TIDE SHEET NEEDS BEYOND THE DAY'S TABLE, asked only while it is
 * open: the beach's facing (map tiles), a month of highs and lows (NOAA, the
 * station the day's table came from), the hourly wind for as far as Open-Meteo
 * forecasts, and the sea (Open-Meteo Marine), the last only where there is a
 * beach. Each part arrives on its own and fails on its own.
 */
export interface Loaded<T> {
  value: T | null
  /** When the copy shown was saved, or null when it is live. */
  savedAt: string | null
  status: 'loading' | 'ready' | 'failed'
}

const LOADING = { value: null, savedAt: null, status: 'loading' } as const

export interface TideSheetData {
  facing: Loaded<CoastFacing | 'inland'>
  month: Loaded<TideExtreme[]>
  wind: Loaded<Hourly>
  marine: Loaded<Hourly | 'inland'>
}

export function useTideSheet(open: boolean, venue: LatLon | null, stationId: string | null): TideSheetData {
  const [facing, setFacing] = useState<Loaded<CoastFacing | 'inland'>>(LOADING)
  const [month, setMonth] = useState<Loaded<TideExtreme[]>>(LOADING)
  const [wind, setWind] = useState<Loaded<Hourly>>(LOADING)
  const [marine, setMarine] = useState<Loaded<Hourly | 'inland'>>(LOADING)
  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null

  useEffect(() => {
    if (!open || lat === null || lon === null) return
    let live = true
    const at = { lat, lon }
    const stops: (() => void)[] = []
    stops.push(
      retrying(async () => {
        const f = await coastFacing(at)
        if (!live) return true
        if (f === 'unavailable') {
          setFacing({ value: null, savedAt: null, status: 'failed' })
          return false
        }
        setFacing({ value: f, savedAt: null, status: 'ready' })
        if (f === 'inland') setMarine({ value: 'inland', savedAt: null, status: 'ready' })
        else
          stops.push(
            retrying(async () => {
              const m = await fetchMarine(at)
              if (!live) return true
              setMarine(m === null ? { value: null, savedAt: null, status: 'failed' } : { value: m.value, savedAt: m.savedAt, status: 'ready' })
              return m !== null
            }),
          )
        return true
      }),
    )
    stops.push(
      retrying(async () => {
        const w = await fetchWindMonth(at)
        if (!live) return true
        setWind(w === null ? { value: null, savedAt: null, status: 'failed' } : { value: w.value, savedAt: w.savedAt, status: 'ready' })
        return w !== null
      }),
    )
    return () => {
      live = false
      for (const s of stops) s()
    }
  }, [open, lat, lon])

  useEffect(() => {
    if (!open || stationId === null) return
    let live = true
    const from = new Date(Date.now() - 86_400_000)
    return retrying(async () => {
      const m = await fetchMonthExtremes(stationId, from)
      if (!live) return true
      setMonth(m === null ? { value: null, savedAt: null, status: 'failed' } : { value: m.value, savedAt: m.savedAt, status: 'ready' })
      return m !== null
    })
  }, [open, stationId])

  return { facing, month, wind, marine }
}

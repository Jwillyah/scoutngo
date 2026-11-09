import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { TideExtreme } from '../core/tide.ts'
import { coastFacing, seaReach, type CoastFacing } from './coast.ts'
import { placeKeyOf, resolveReach } from './placeMemory.ts'
import { latestBuoys, type BuoyReading } from './buoy.ts'
import { showSurf, SURF_COAST_M, type SurfSetting } from './surfSetting.ts'
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
  /** Metres to the ocean within SURF_COAST_M, or null when none is (the surf row's Auto test). */
  seaM: Loaded<number | null>
  /** The nearest buoy's latest waves, asked only when the surf row shows. */
  buoy: BuoyReading | null
  /** The 2-3 nearest buoys on the water the beach faces (Batch H), each its own reading. */
  buoys: BuoyReading[] | null
  /** Whether the surf row shows: the setting, and on Auto the sea within SURF_COAST_M. */
  surf: boolean
}

export function useTideSheet(open: boolean, venue: LatLon | null, stationId: string | null, surfSetting: SurfSetting = 'auto'): TideSheetData {
  const [seaM, setSeaM] = useState<Loaded<number | null>>(LOADING)
  const [buoys, setBuoys] = useState<BuoyReading[] | null>(null)
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
    let askedSea = false
    stops.push(
      retrying(async () => {
        const f = await coastFacing(at)
        if (!live) return true
        /*
         * Batch Map A3 (9 Nov, LTE: the Tide page's water said "waiting for
         * the sea forecast" for good): the sea was asked only once the
         * beach's facing had come from the map's tiles, and on that link the
         * tiles did not. The sea's temperature does not need the facing: it
         * is asked at once unless the map has said there is no sea here.
         */
        if (f !== 'inland' && !askedSea) {
          askedSea = true
          stops.push(
            retrying(async () => {
              const m = await fetchMarine(at)
              if (!live) return true
              setMarine((prev) => (m === null ? (prev.value !== null ? prev : { value: null, savedAt: null, status: 'failed' }) : { value: m.value, savedAt: m.savedAt, status: 'ready' }))
              return m !== null
            }),
          )
        }
        if (f === 'unavailable') {
          setFacing({ value: null, savedAt: null, status: 'failed' })
          return false
        }
        setFacing({ value: f, savedAt: null, status: 'ready' })
        if (f === 'inland') setMarine({ value: 'inland', savedAt: null, status: 'ready' })
        return true
      }),
    )
    stops.push(
      retrying(async () => {
        /* Offline the tiles cannot say; the last answer here stands (src/lib/placeMemory.ts). */
        const m = resolveReach(placeKeyOf(at.lat, at.lon), await seaReach(at, SURF_COAST_M))
        if (!live) return true
        if (m === undefined) {
          setSeaM({ value: null, savedAt: null, status: 'failed' })
          return false
        }
        setSeaM({ value: m, savedAt: null, status: 'ready' })
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

  const surfWanted = showSurf(surfSetting, seaM.value)
  /* The buoys wait for the facing: which water the beach faces chooses them. Failed facing: the nearest. */
  const facingDeg = facing.status === 'loading' ? undefined : facing.value === null || facing.value === 'inland' ? null : Math.round(facing.value.facing)
  useEffect(() => {
    if (!open || !surfWanted || lat === null || lon === null || facingDeg === undefined) return
    let live = true
    return retrying(async () => {
      const b = await latestBuoys({ lat, lon }, facingDeg)
      if (!live) return true
      setBuoys(b)
      return b.some((r) => r.status === 'ok') || (b[0]?.status === 'none' && b[0].reason !== "The buoy didn't load.")
    })
  }, [open, surfWanted, lat, lon, facingDeg])

  return { facing, month, wind, marine, seaM, buoy: buoys?.[0] ?? null, buoys, surf: surfWanted }
}

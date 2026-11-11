import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { latestBuoys, type BuoyReading } from './buoy.ts'
import { coastFacing } from './coast.ts'
import { retrying } from './retrying.ts'
import { fetchMarine, type Hourly } from './tideSheetData.ts'

/*
 * WHAT THE BUOYS PAGE (v2) ASKS, only while it is open: the beach's facing
 * (which water the buoys must be on, src/lib/buoy.ts), the 2-3 nearest NDBC
 * buoys' latest readings (/api/buoy, a buoy number only), and the spot's own
 * Open-Meteo Marine forecast (the same request and cache as the Tide sheet
 * and the Surf page) for the "running smaller / bigger" line.
 */
export interface BuoyPageData {
  /** null while asking. */
  buoys: BuoyReading[] | null
  /** The spot's marine forecast; 'inland' where there is no sea; null while asking or when it failed. */
  marine: Hourly | 'inland' | null
  marineFailed: boolean
  /** The beach's facing, the same one the Surf page reads (src/lib/coast.ts); null while asking, inland or when it failed. */
  facing: number | null
}

export function useBuoyPage(venue: LatLon): BuoyPageData {
  const { lat, lon } = venue
  /* Each answer is kept with the spot it is for, so a moved spot shows nothing old (failure-modes.md, A). */
  const key = `${lat},${lon}`
  const [buoysFor, setBuoys] = useState<{ key: string; value: BuoyReading[] } | null>(null)
  const [marineFor, setMarine] = useState<{ key: string; value: Hourly | 'inland' | null } | null>(null)
  const [facingFor, setFacing] = useState<{ key: string; value: number | null } | null>(null)

  useEffect(() => {
    let live = true
    const at = { lat, lon }
    const k = `${lat},${lon}`
    const stops: (() => void)[] = []
    stops.push(
      retrying(async () => {
        const f = await coastFacing(at)
        if (!live) return true
        /* Failed facing: the nearest buoys, whichever water (as the Tide sheet does). */
        const facingDeg = f === 'unavailable' || f === 'inland' ? null : Math.round(f.facing)
        setFacing({ key: k, value: facingDeg })
        if (f === 'inland') setMarine({ key: k, value: 'inland' })
        else
          stops.push(
            retrying(async () => {
              const m = await fetchMarine(at)
              if (!live) return true
              setMarine({ key: k, value: m === null ? null : m.value })
              return m !== null
            }),
          )
        stops.push(
          retrying(async () => {
            const b = await latestBuoys(at, facingDeg)
            if (!live) return true
            setBuoys({ key: k, value: b })
            return b.some((r) => r.status === 'ok') || (b[0]?.status === 'none' && b[0].reason !== "The buoy didn't load.")
          }),
        )
        return true
      }),
    )
    return () => {
      live = false
      for (const s of stops) s()
    }
  }, [lat, lon])

  const marine = marineFor?.key === key ? marineFor : null
  return { buoys: buoysFor?.key === key ? buoysFor.value : null, marine: marine === null ? null : marine.value, marineFailed: marine !== null && marine.value === null, facing: facingFor?.key === key ? facingFor.value : null }
}

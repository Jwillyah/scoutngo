/*
 * THE HOURLY SURF CHECK AT THIS SPOT (Batch N, Section 5), while the app is
 * open: the face height the app shows for the buoy's reading hour against the
 * same estimate from what the buoy measured (src/core/spotSkill.ts), kept on
 * this phone (src/lib/spotSkillStore.ts).
 *
 * No new hosts. The forecast is Open-Meteo Marine through fetchMarine (the
 * shared weather store: the copy the Tide sheet and the home already asked
 * for), the facing is the map tiles' coastFacing, and the buoy is /api/buoy,
 * which is sent only a station number. A caller that already holds any of
 * these passes it in and nothing is asked again.
 */
import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { buoyFaceFt, hourOf, HOUR_MS, spotKey, spotStats, type SkillSample, type SpotStats } from '../core/spotSkill.ts'
import { latestBuoyWaves, type BuoyReading } from './buoy.ts'
import { coastFacing } from './coast.ts'
import { readSkillBook, sampleDue, withSample, writeSkillBook } from './spotSkillStore.ts'
import { surfAt } from './surfDay.ts'
import { fetchMarine, type Hourly } from './tideSheetData.ts'

/* A buoy reading older than this is not "this hour"; NDBC posts about every half hour. */
export const BUOY_FRESH_MS = 2 * HOUR_MS
/* How often the open app looks whether the hour is up; the sample itself stays once an hour. */
export const CHECK_EVERY_MS = 5 * 60_000

/** One hour's pair from what is in hand, or null when either side cannot be worked out. */
export function sampleFrom(marine: Hourly, buoy: BuoyReading, facingDeg: number | null, now: number): SkillSample | null {
  if (buoy.status !== 'ok') return null
  const at = buoy.at.getTime()
  if (!Number.isFinite(at) || now - at > BUOY_FRESH_MS || at > now + HOUR_MS) return null
  const buoyFt = buoyFaceFt({ waveM: buoy.waveM, periodS: buoy.periodS, fromDeg: buoy.fromDeg }, facingDeg)
  if (buoyFt === null) return null
  const forecast = surfAt(marine, buoy.at, facingDeg)
  if (forecast === null) return null
  return { at: hourOf(at), forecastFt: forecast.estimate.faceFt, buoyFt, rating: null }
}

export interface SpotSkillGiven {
  marine?: Hourly | null
  /** The beach's facing; null when it has none (inland or unknown). */
  facingDeg?: number | null
  buoy?: BuoyReading | null
}

export interface SpotSkill {
  key: string | null
  stats: SpotStats
}

const NONE: SpotStats = { n: 0, biasFt: null, spreadFt: null, days: 0 }

export function useSpotSkill(spot: LatLon | null, given: SpotSkillGiven = {}): SpotSkill {
  const key = spot === null ? null : spotKey(spot)
  /* Bumped after each sample so the stats are read again from storage. */
  const [taken, setTaken] = useState(() => Date.now())
  const stats = useMemo(() => (key === null ? NONE : spotStats(readSkillBook()[key]?.samples ?? [], taken)), [key, taken])
  const lat = spot?.lat ?? null
  const lon = spot?.lon ?? null
  const { marine: gMarine, facingDeg: gFacing, buoy: gBuoy } = given

  useEffect(() => {
    if (key === null || lat === null || lon === null) return
    let live = true
    let busy = false
    const check = async () => {
      if (busy || !sampleDue(readSkillBook(), key, Date.now())) return
      busy = true
      try {
        const at = { lat, lon }
        let facing: number | null
        if (gFacing !== undefined) facing = gFacing
        else {
          const f = await coastFacing(at)
          if (f === 'unavailable') return
          if (f === 'inland') {
            /* No beach, no surf to check: count the try so it is not asked again this hour. */
            writeSkillBook(withSample(readSkillBook(), key, null, Date.now()))
            return
          }
          facing = Math.round(f.facing)
        }
        const marine = gMarine ?? (await fetchMarine(at))?.value ?? null
        const buoy = gBuoy ?? (await latestBuoyWaves(at, facing))
        if (marine === null) return
        if (buoy.status === 'none' && buoy.reason === "The buoy didn't load.") return
        const now = Date.now()
        const book = withSample(readSkillBook(), key, sampleFrom(marine, buoy, facing, now), now)
        writeSkillBook(book)
        if (live) setTaken(now)
      } catch {
        /* Offline or refused: the next check tries again. */
      } finally {
        busy = false
      }
    }
    void check()
    const timer = setInterval(() => void check(), CHECK_EVERY_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [key, lat, lon, gMarine, gFacing, gBuoy])

  return { key, stats }
}

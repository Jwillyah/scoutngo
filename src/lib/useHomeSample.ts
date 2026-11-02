import { useEffect, useMemo, useState } from 'react'
import { getMoonIllumination, getPosition } from 'suncalc'
import { findAlignments, type Alignment } from '../core/alignment.ts'
import { goldenNext } from '../core/goldenNext.ts'
import { nextEvents } from '../core/skyFire.ts'
import { fireVerdict, lookWindow } from '../core/fireOutlook.ts'
import { formatClock } from '../core/timezone.ts'
import { DASH, SAMPLE_FACING_DEG, SAMPLE_PIER_END, SAMPLE_SPOT, SAMPLE_TZ, lightBand, moonLine, skyFireLine, surfBand, tideBand, windBand, type BandValue } from '../core/homeSample.ts'
import { fetchFirePaths, nearestHour, pathsAt } from './skyFireData.ts'
import { fetchMarine } from './tideSheetData.ts'
import { surfAt } from './surfDay.ts'
import { useTide } from './useTide.ts'
import { useWind } from './useWind.ts'

/*
 * THE HOME PAGE'S LIVE VALUES, for the fixed sample beach (src/core/homeSample.ts).
 * Each part arrives on its own and fails quietly to a dash. The pier is the
 * only place named in any request; the visitor's location is never asked.
 */
export interface HomeSample {
  light: BandValue
  tide: BandValue
  surf: BandValue
  wind: BandValue
  skyFire: string | null
  moon: string | null
}

const clock = (d: Date) => formatClock(d, SAMPLE_TZ).toLowerCase()
const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: SAMPLE_TZ, weekday: 'short' }).format(d)

export function useHomeSample(now: Date): HomeSample {
  /* The minute, so a re-render inside it asks nothing again. */
  const minute = Math.floor(now.getTime() / 60_000)
  const at = useMemo(() => new Date(minute * 60_000), [minute])

  const light = useMemo(() => lightBand(goldenNext((t) => getPosition(t, SAMPLE_SPOT.lat, SAMPLE_SPOT.lon).altitude, at), at, clock), [at])

  const tideInfo = useTide(SAMPLE_SPOT, at)
  const tide = tideBand(tideInfo.status === 'ok' ? tideInfo.predictions.extremes : null, at, clock)

  const windState = useWind(SAMPLE_SPOT, at, SAMPLE_TZ)
  const wind = windBand(windState.wind)

  const [surf, setSurf] = useState<BandValue>({ value: DASH, word: '' })
  useEffect(() => {
    let live = true
    void fetchMarine(SAMPLE_SPOT)
      .then((m) => {
        if (!live || m === null) return
        const h = surfAt(m.value, at, SAMPLE_FACING_DEG)
        setSurf(surfBand(h?.estimate ?? null))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [at])

  const [skyFire, setSkyFire] = useState<string | null>(null)
  useEffect(() => {
    const events = nextEvents(at, SAMPLE_SPOT)
    const kind = events.sunset !== null && (events.sunrise === null || events.sunset < events.sunrise) ? 'sunset' : events.sunrise !== null ? 'sunrise' : null
    const event = kind === null ? null : events[kind]
    if (kind === null || event === null) return
    let live = true
    const azimuth = getPosition(event, SAMPLE_SPOT.lat, SAMPLE_SPOT.lon).azimuth
    void fetchFirePaths(SAMPLE_SPOT, azimuth, event.toISOString().slice(0, 10))
      .then((data) => {
        if (!live || data === null) return
        const paths = pathsAt(data, nearestHour(event))
        const verdict = paths.length === 0 ? null : fireVerdict(paths, { event, kind, venue: SAMPLE_SPOT })
        if (verdict === null) return
        const from = lookWindow(verdict)?.from ?? null
        setSkyFire(skyFireLine(kind, verdict.word, event, from, clock))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [at])

  /* The alignment finder over its own twelve months, off the first paint. */
  const [moon, setMoon] = useState<string | null>(null)
  const hourKey = Math.floor(minute / 60)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const from = new Date(hourKey * 3_600_000)
      let found: Alignment | null = null
      try {
        found = findAlignments({ observer: SAMPLE_SPOT, target: SAMPLE_PIER_END, body: 'moon', mode: 'rise', from, limit: 1 })[0] ?? null
      } catch {
        found = null
      }
      setMoon(found === null ? null : moonLine(found, getMoonIllumination(found.at).fraction, day, clock))
    }, 200)
    return () => window.clearTimeout(id)
  }, [hourKey])

  return { light, tide, surf, wind, skyFire, moon }
}

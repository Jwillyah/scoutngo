/*
 * WHAT THE MAP'S TIMELINE BAR READS (Batch DRONE, Section 3), other than the
 * wind, which comes from the map's own wind layer at the marker
 * (src/components/MapView.tsx onWindStrip) so the bar and the colour on the
 * map are one answer.
 *
 *   clouds  the cover at the marker by the hour: the briefing's own request
 *           (fetchBriefWind, the same URL the home asks at the spot), so at
 *           the spot it is no new request at all
 *   tide    the ONE station the spot's tide comes from (src/lib/useTide.ts
 *           `chosen`, CORE Section 3), its predictions across the bar's five
 *           days: the first day asks NOAA to TIDE_AHEAD_DAYS ahead, and every
 *           following day is that same answer, kept (src/lib/noaa.ts)
 *
 * Each is asked when the layer is picked or the marker moves, never while
 * the thumb is dragged: the bar draws every hour from what is already here.
 * Nothing in a request says where the user is; the marker's point is rounded
 * to 2 decimals as every forecast question is.
 */
import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { HOUR_MS, type BarSpan } from '../core/layerTimeline.ts'
import type { TideExtreme, TideSample } from '../core/tide.ts'
import { fetchPredictions } from './noaa.ts'
import { fetchBriefWind, type Hourly } from './tideSheetData.ts'

/** The briefing's hourly answer at a point (rounded), while `on`. */
export function useBriefHours(point: LatLon | null, on: boolean): Hourly | null {
  const key = point === null || !on ? null : `${point.lat.toFixed(2)},${point.lon.toFixed(2)}`
  const [got, setGot] = useState<{ key: string; h: Hourly | null } | null>(null)
  useEffect(() => {
    if (key === null || point === null) return
    let live = true
    const t = setTimeout(() => {
      void fetchBriefWind({ lat: Number(point.lat.toFixed(2)), lon: Number(point.lon.toFixed(2)) }).then(
        (h) => live && setGot({ key, h }),
        () => live && setGot({ key, h: null }),
      )
    }, 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return got !== null && got.key === key ? got.h : null
}

/** One named series of an hourly answer laid on the bar: index i is span.from + i h; null where it said nothing. */
export function hoursOnBar(h: Hourly | null, name: string, span: BarSpan): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: span.hours }, () => null)
  if (h === null) return out
  const values = h.values[name] ?? []
  for (let k = 0; k < h.times.length; k += 1) {
    const i = Math.round((h.times[k] - span.from.getTime()) / HOUR_MS)
    if (i >= 0 && i < span.hours) out[i] = values[k] ?? null
  }
  return out
}

export interface TideWeek {
  curve: TideSample[]
  extremes: TideExtreme[]
  /** Why there is none, in words; null while it loads or when there is one. */
  problem: string | null
}

/** The chosen station's predictions across the bar. */
export function useTideWeek(stationId: string | null, span: BarSpan | null, on: boolean): TideWeek | null {
  const from = span?.from.getTime() ?? null
  const days = span === null ? 0 : Math.ceil(span.hours / 24)
  const key = !on || stationId === null || from === null ? null : `${stationId}|${from}|${days}`
  const [got, setGot] = useState<{ key: string; week: TideWeek } | null>(null)
  useEffect(() => {
    if (key === null || stationId === null || from === null) return
    let live = true
    void (async () => {
      const curve = new Map<number, TideSample>()
      const extremes = new Map<number, TideExtreme>()
      let problem: string | null = null
      /* In order: the first answer keeps the following days (src/lib/noaa.ts), so the rest are no request. */
      for (let d = 0; d < days; d += 1) {
        const r = await fetchPredictions(stationId, new Date(from + 12 * HOUR_MS + d * 86_400_000))
        if (!live) return
        if (r.status !== 'ok') {
          problem ??= r.reason
          continue
        }
        for (const c of r.predictions.curve) curve.set(c.at.getTime(), c)
        for (const e of r.predictions.extremes) extremes.set(e.at.getTime(), e)
      }
      const byTime = <T extends { at: Date }>(m: Map<number, T>) => [...m.values()].sort((a, b) => a.at.getTime() - b.at.getTime())
      setGot({ key, week: { curve: byTime(curve), extremes: byTime(extremes), problem: curve.size > 0 ? null : (problem ?? 'No tide predictions for these days.') } })
    })()
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return got !== null && got.key === key ? got.week : null
}

/*
 * WHAT SKY FIRE'S PAGES 2 AND 3 DRAW (Batch F, Section 6), as data.
 *
 * Page 2, "Four forecasts": the same sunrise or sunset once per model, with
 * that model's cloud over the venue (the first sample on the sun's line) and
 * whether it fires by the same checks as the verdict (skyFire.ts checkModel).
 * Page 3, "Week of skies": every sunrise and sunset for seven days, with the
 * venue's forecast cloud at that hour. The pictures of them are drawn from
 * these numbers (src/three/skyThumb.ts); the numbers are what they say.
 */
import { getPosition, getTimes } from 'suncalc'
import type { Cover } from './clouds.ts'
import { checkModel, MODEL_LABEL, type FireModel, type ModelPath } from './skyFire.ts'
import type { LatLon } from './geo.ts'

/* The four the board names: one per centre, the short-range US model first. */
export const FOUR: readonly FireModel[] = ['gfs_hrrr', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless']

export interface ModelSky {
  model: FireModel
  label: string
  cover: Cover
  fires: boolean
}

export function fourSkies(paths: readonly ModelPath[]): ModelSky[] {
  return FOUR.flatMap((m) => {
    const p = paths.find((x) => x.model === m)
    const s = p?.samples[0]
    if (p === undefined || s === undefined || (s.low === null && s.mid === null && s.high === null)) return []
    return [{ model: m, label: MODEL_LABEL[m], cover: { low: s.low, mid: s.mid, high: s.high }, fires: checkModel(p).fires }]
  })
}

export interface WeekEvent {
  kind: 'sunrise' | 'sunset'
  at: Date
  sunAzimuthDeg: number
  cover: Cover | null
}

/** Every sunrise and sunset in the seven days from `from`'s day, in order, with the cloud `coverAt` gives (null where the forecast does not reach). */
export function weekOfSkies(venue: LatLon, from: Date, coverAt: (at: Date) => Cover | null, days = 7): WeekEvent[] {
  const out: WeekEvent[] = []
  for (let d = 0; d < days; d += 1) {
    const t = getTimes(new Date(from.getTime() + d * 86_400_000), venue.lat, venue.lon)
    for (const kind of ['sunrise', 'sunset'] as const) {
      const at = t[kind]
      if (!(at instanceof Date) || Number.isNaN(at.getTime())) continue
      out.push({ kind, at, sunAzimuthDeg: getPosition(at, venue.lat, venue.lon).azimuth, cover: coverAt(at) })
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

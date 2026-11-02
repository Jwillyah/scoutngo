/*
 * WHAT SKY FIRE'S PAGES 2 AND 3 DRAW (Batch F, Section 6), as data.
 *
 * Page 2, "Four forecasts": the same sunrise or sunset once per model, with
 * that model's cloud over the venue (the first sample on the sun's line) and
 * its own read of the verdict (src/core/fireOutlook.ts, the same arithmetic as
 * the colour clock). Since Batch G each picture is drawn at that model's
 * deepest glow, the sun where it is then, with the clock's colour on the
 * layers that fire: lit cirrus before sunrise is pink and orange, not the grey
 * of the minute of sunrise. Page 3, "Week of skies": every sunrise and sunset
 * for seven days, with the venue's forecast cloud at that hour. The pictures
 * are drawn from these numbers (src/three/skyThumb.ts).
 */
import { getPosition, getTimes } from 'suncalc'
import type { Cover } from './clouds.ts'
import { MODEL_LABEL, type FireModel, type ModelPath } from './skyFire.ts'
import type { FireVerdict } from './fireOutlook.ts'
import type { Layer } from './skyColour.ts'
import type { LatLon } from './geo.ts'

/* The four the board names: one per centre, the short-range US model first. */
export const FOUR: readonly FireModel[] = ['gfs_hrrr', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless']

export interface ModelSky {
  model: FireModel
  label: string
  cover: Cover
  fires: boolean
  /** The minute the picture shows: the model's deepest glow, else the event. */
  at: Date
  /** Linear RGB of the light on each layer that fires, at that minute. */
  glow: Partial<Record<Layer, readonly [number, number, number]>>
  /** The layer the words name: "lit high cirrus". */
  lit: Layer | null
}

export function fourSkies(paths: readonly ModelPath[], v: FireVerdict | null, event: Date): ModelSky[] {
  return FOUR.flatMap((m) => {
    const p = paths.find((x) => x.model === m)
    const s = p?.samples[0]
    if (p === undefined || s === undefined || (s.low === null && s.mid === null && s.high === null)) return []
    const read = v?.models.find((x) => x.model === m)
    const firing = (read?.layers ?? []).filter((l) => l.fires && l.times !== null)
    const pick = firing
      .map((l) => ({ l, t: l.times?.deepest ?? l.times?.glowFrom ?? null }))
      .filter((x): x is { l: (typeof firing)[number]; t: Date } => x.t !== null)
      .sort((a, b) => a.t.getTime() - b.t.getTime())[0]
    const at = pick?.t ?? event
    const glow: ModelSky['glow'] = {}
    for (const l of firing) {
      const light = l.strip?.minutes.find((x) => x.at.getTime() === at.getTime())?.light ?? null
      if (light !== null) glow[l.layer] = light.rgb
    }
    return [{ model: m, label: MODEL_LABEL[m], cover: { low: s.low, mid: s.mid, high: s.high }, fires: read?.fires ?? false, at, glow, lit: pick?.l.layer ?? null }]
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

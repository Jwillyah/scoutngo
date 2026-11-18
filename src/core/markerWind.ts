/*
 * ONE WIND AT THE MARKER, FOR A POINT AND AN HOUR (Batch 3D, Section 4.1).
 * 17 Nov, live, the Cape Henry marker, 12 PM: the readout said 5 kt, the hour
 * list under it 8 kt, and the map at z4 and z2 13 kt. Three readers, three
 * values:
 *
 *   readout   src/components/WindLayerV3.tsx `here`: the one wind now at the
 *             spot (leaned to the station) at now, else the fine grid's
 *             point, else the view's coarse grid sampled at the marker
 *   hour list src/components/MapView.tsx (onWindStrip): the view's grid
 *             point nearest the marker, raw model, no station
 *   z4 / z2   the coarse grid again, whenever the fine point had not come
 *
 * Now there is this: the model at the marker for any time (the fine grid's
 * block when it has come, the view's grid until then), leaned toward the
 * station's report the way the home and the Wind page lean it (nowcast.ts),
 * with the one wind now standing for the hour that holds now. The readout and
 * every row of the hour list call markerWindAt; nothing else computes a wind
 * at the marker.
 */
import { nowcastAt, obsFresh, type StationObs, type WindAt } from './nowcast.ts'
import { buildField, fromUV, sampleField, toUV, type Field, type WindSample } from './windViewport.ts'

/*
 * CALM HAS NO DIRECTION (Batch QA, Section 0B; field 10 Nov: "1 kt NNE
 * cross-shore" became "2 kt SW offshore" nine minutes later). Under CALM_KT,
 * 3 kt, the vane says nothing the beach can use: the wind is "Calm", with no
 * side to the beach and no arrow. Every wind now passes through here
 * (src/lib/windNow.ts re-exports these).
 */
export const CALM_KT = 3
export const CALM_MPS = CALM_KT / 1.943844
export const calmDirection = (mps: number | null, fromDeg: number | null): number | null => (mps === null || mps < CALM_MPS ? null : fromDeg)
export const isCalm = (mps: number | null): boolean => mps !== null && mps < CALM_MPS

const HOUR_MS = 3_600_000

/** The fine grid the marker always reads: the cache's own 0.05 degrees, as at zoom 9 and in (src/lib/useWindViewport.ts re-exports it). */
export const POINT_STEP = 0.05

/** The hour's half past: two screens a few seconds apart read the same hour. */
export const halfHour = (t: Date): Date => new Date(Math.floor(t.getTime() / HOUR_MS) * HOUR_MS + 1_800_000)

/** One grid point's hours (src/lib/useWindViewport.ts PointSeries has this shape). */
export interface PointSeriesLike {
  lat: number
  lon: number
  times: number[]
  speed: (number | null)[]
  from: (number | null)[]
  gust: (number | null)[]
}

/** The field at one hour (the nearest the series has, within 90 minutes). */
export function fieldFromSeries(series: readonly PointSeriesLike[], step: number, at: Date): Field | null {
  const t = at.getTime()
  const samples: WindSample[] = []
  for (const s of series) {
    let best = -1
    for (let i = 0; i < s.times.length; i += 1) if (best < 0 || Math.abs(s.times[i] - t) < Math.abs(s.times[best] - t)) best = i
    if (best < 0 || Math.abs(s.times[best] - t) > 90 * 60_000) continue
    const sp = s.speed[best]
    const fr = s.from[best]
    if (sp === null || fr === null) continue
    samples.push({ lat: s.lat, lon: s.lon, ...toUV(sp, fr), gust: s.gust[best] })
  }
  return buildField(samples, step)
}

/** The model's wind at a point, for any time: the grid's hour nearest it, read bilinearly at the point. Null where the grid says nothing. */
export function pointModel(series: readonly PointSeriesLike[], step: number, lat: number, lon: number): (t: Date) => WindAt | null {
  const kept = new Map<number, WindAt | null>()
  return (t) => {
    const hour = Math.floor(t.getTime() / HOUR_MS)
    if (kept.has(hour)) return kept.get(hour) ?? null
    const f = fieldFromSeries(series, step, new Date(hour * HOUR_MS))
    const s = f === null ? null : sampleField(f, lat, lon)
    const out: WindAt | null = s === null ? null : (({ speedMps, fromDeg }) => ({ mps: speedMps, fromDeg: calmDirection(speedMps, fromDeg), gustMps: s.gust }))(fromUV(s.u, s.v))
    kept.set(hour, out)
    return out
  }
}

/** The grid the marker reads: the fine block around it when it has come (the same at every zoom), the view's grid until then. */
export function markerModelFor(fine: readonly PointSeriesLike[] | null, view: readonly PointSeriesLike[], viewStep: number, lat: number, lon: number): (t: Date) => WindAt | null {
  return fine !== null && fine.length > 0 ? pointModel(fine, POINT_STEP, lat, lon) : pointModel(view, viewStep, lat, lon)
}

export interface MarkerWindIn {
  /** The model at the marker for any time (pointModel). */
  model: (t: Date) => WindAt | null
  /** The station's report to lean toward (src/lib/useStationObs.ts), or null when none counts here. */
  obs: StationObs | null
  /** The one wind now at the spot, standing for the hour that holds `at`; null away from the spot. */
  anchor: { at: Date; wind: WindAt } | null
  now: Date
}

/** The wind at the marker at `t`: the one function the readout and the hour list share. */
export function markerWindAt(i: MarkerWindIn, t: Date): WindAt | null {
  const half = halfHour(t).getTime()
  if (i.anchor !== null && halfHour(i.anchor.at).getTime() === half) return i.anchor.wind
  const w = nowcastAt(i.model, obsFresh(i.obs, i.now) ? i.obs : null, halfHour(t))
  return w === null ? null : { ...w, fromDeg: calmDirection(w.mps, w.fromDeg) }
}

/** The marker's hours (epoch ms, on the hour), one per hour of the series: what the hour list and the timeline bar draw. */
export function markerStrip(i: MarkerWindIn, times: readonly number[]): { from: number; mps: (number | null)[]; gust: (number | null)[]; fromDeg: (number | null)[] } | null {
  if (times.length === 0) return null
  const ws = times.map((t) => markerWindAt(i, new Date(t)))
  return { from: times[0], mps: ws.map((w) => w?.mps ?? null), gust: ws.map((w) => w?.gustMps ?? null), fromDeg: ws.map((w) => w?.fromDeg ?? null) }
}

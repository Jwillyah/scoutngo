/*
 * THE SATELLITE'S PATCH, CARRIED TO THE COLOR'S TIME (Batch NOW, Section 0.3;
 * left undone in BEST SKY). The frame is of the cloud as it was up to three
 * hours before the color; the cloud moves with the wind at its height. Each
 * grid point is a patch at the event when the point the wind brings to it,
 * DRIFT upwind, was cold in the frame. The wind is the 500 hPa level's
 * (about 5,500 m, the mid deck's), the grid's mean, from the tiles' own
 * answer. Said: "patch drifting E at 15 kt".
 */
import { compassPoint } from './field.ts'
import { destinationPoint, distanceMeters, type LatLon } from './geo.ts'

const KT_PER_KMH = 1 / 1.852

export interface Drift {
  /** Where the cloud goes, degrees. */
  toDeg: number
  kt: number
  km: number
}

/** The grid's mean wind (km/h, from), as a drift over `ms`. Null when not said or calm. */
export function driftOf(winds: readonly { kmh: number | null; fromDeg: number | null }[], ms: number): Drift | null {
  let u = 0
  let v = 0
  let n = 0
  for (const w of winds) {
    if (w.kmh === null || w.fromDeg === null || !Number.isFinite(w.kmh) || !Number.isFinite(w.fromDeg)) continue
    const to = ((w.fromDeg + 180) * Math.PI) / 180
    u += w.kmh * Math.sin(to)
    v += w.kmh * Math.cos(to)
    n += 1
  }
  if (n === 0 || ms <= 0) return null
  const kmh = Math.hypot(u, v) / n
  if (kmh < 1) return null
  const toDeg = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360
  return { toDeg, kt: kmh * KT_PER_KMH, km: (kmh * ms) / 3_600_000 }
}

/** Each point's patch at the event: the patch of the grid point nearest to where its air was at the frame. */
export function driftPatches<T extends LatLon & { satPatch?: boolean | null }>(points: readonly T[], d: Drift | null): T[] {
  if (d === null || d.km < 0.5) return [...points]
  return points.map((p) => {
    const from = destinationPoint(p, (d.toDeg + 180) % 360, d.km * 1000)
    let best: T | null = null
    let bestD = Infinity
    for (const q of points) {
      const m = distanceMeters(q, from)
      if (m < bestD) {
        bestD = m
        best = q
      }
    }
    /* Off the grid's edge upwind: not known. */
    const step = points.length < 2 ? Infinity : Math.min(...points.slice(1, 6).map((q) => distanceMeters(points[0], q)).filter((m) => m > 0))
    return { ...p, satPatch: best === null || bestD > step ? null : (best.satPatch ?? null) }
  })
}

/** "patch drifting E at 15 kt". */
export const driftWords = (d: Drift): string => `patch drifting ${compassPoint(d.toDeg)} at ${Math.round(d.kt)} kt`

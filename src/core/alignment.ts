/*
 * WHEN DOES THE SUN OR MOON LINE UP WITH THAT?
 *
 * Drop a target -- a lighthouse, the end of a pier -- and ask when the sun or
 * the moon rises behind it, sets behind it, or sits at a chosen height behind
 * it, from where you stand, over the next twelve months.
 *
 * HOW. The body crosses the wanted altitude twice a day. Each crossing is
 * found where (altitude - wanted) changes sign on a coarse scan and bisected
 * to the second, the same sign-change approach as sunInverse.ts and for the
 * same reason: a tolerance scan steps straight over a narrow alignment. The
 * crossing is kept when the body's bearing there is within tolerance of the
 * target's.
 *
 * WHY NOT sunInverse.ts ITSELF. It is sun-only and solves a different
 * question (the moment the sun reaches a bearing); this needs the moon too
 * and the moment it reaches an altitude. The signed bearing arithmetic is
 * shared from it rather than written twice. If the aim panel ever wants the
 * moon, sunInverse can delegate here.
 *
 * RISE AND SET ARE THE TOP EDGE ON THE HORIZON, the convention almanacs use:
 * the sun's centre 0.833 degrees below (refraction plus its half-width), the
 * moon's 0.133 above (suncalc's own figure, parallax included).
 */
import { getMoonPosition, getPosition } from 'suncalc'
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { signedBearingDelta } from './sunInverse.ts'
import { normalizeBearing } from './sun.ts'

export type Body = 'sun' | 'moon'
export type AlignMode = 'rise' | 'set' | 'height'

/** Half the body's width on the sky, in degrees. */
export const HALF_WIDTH: Record<Body, number> = { sun: 0.27, moon: 0.26 }
/** Slack either side of the target's bearing, on top of the body's own half-width. */
export const BEARING_SLACK_DEGREES = 1
/** The altitude of the centre at rise and set. See the header. */
export const HORIZON_ALTITUDE: Record<Body, number> = { sun: -0.833, moon: 0.133 }

const SEARCH_DAYS = 365
const STEP_MS = 10 * 60_000

export interface AlignQuery {
  observer: LatLon
  target: LatLon
  body: Body
  mode: AlignMode
  /** Height mode: the altitude to sit at, in degrees. See targetAltitude. */
  altitudeDeg?: number
  /** Degrees either side of the target's bearing. Default slack plus half-width. */
  toleranceDeg?: number
  from: Date
  /** Default twelve months after `from`. */
  to?: Date
  limit?: number
}

export interface Alignment {
  at: Date
  azimuth: number
  altitude: number
  /** Signed, body bearing to target bearing, in degrees. Inside the tolerance. */
  offsetDegrees: number
  direction: 'rising' | 'setting'
}

function position(body: Body, at: Date, where: LatLon): { azimuth: number; altitude: number } {
  const p = body === 'sun' ? getPosition(at, where.lat, where.lon) : getMoonPosition(at, where.lat, where.lon)
  return { azimuth: normalizeBearing(p.azimuth), altitude: p.altitude }
}

/**
 * The altitude of the top of a target, seen from the observer: for "the moon
 * sitting on top of the lighthouse". Flat ground; heights in metres above it.
 */
export function targetAltitude(
  observer: LatLon,
  target: LatLon,
  targetHeightMeters: number,
  observerHeightMeters = 1.6,
): number {
  const d = distanceMeters(observer, target)
  if (d <= 0) return 90
  return (Math.atan2(targetHeightMeters - observerHeightMeters, d) * 180) / Math.PI
}

export function findAlignments(query: AlignQuery): Alignment[] {
  const { observer, target, body, mode } = query
  const want = mode === 'height' ? query.altitudeDeg : HORIZON_ALTITUDE[body]
  if (want === undefined || !Number.isFinite(want)) return []
  const bearing = bearingBetween(observer, target)
  const tolerance = query.toleranceDeg ?? BEARING_SLACK_DEGREES + HALF_WIDTH[body]
  const first = query.from.getTime()
  const last = (query.to ?? new Date(first + SEARCH_DAYS * 86_400_000)).getTime()
  const limit = query.limit ?? 100

  const errorAt = (t: number) => position(body, new Date(t), observer).altitude - want
  const out: Alignment[] = []
  let prevT = first
  let prevE = errorAt(first)
  for (let t = first + STEP_MS; t <= last && out.length < limit; t += STEP_MS) {
    const e = errorAt(t)
    if (Math.sign(e) !== Math.sign(prevE) && prevE !== 0) {
      const rising = e > prevE
      if (mode === 'height' || (mode === 'rise') === rising) {
        let a = prevT
        let b = t
        let ea = prevE
        while (b - a > 1000) {
          const mid = (a + b) / 2
          const em = errorAt(mid)
          if (Math.sign(em) === Math.sign(ea)) {
            a = mid
            ea = em
          } else {
            b = mid
          }
        }
        const at = new Date(Math.round((a + b) / 2))
        const p = position(body, at, observer)
        const offset = signedBearingDelta(bearing, p.azimuth)
        if (Math.abs(offset) <= tolerance) {
          out.push({
            at,
            azimuth: p.azimuth,
            altitude: p.altitude,
            offsetDegrees: offset,
            direction: rising ? 'rising' : 'setting',
          })
        }
      }
    }
    prevT = t
    prevE = e
  }
  return out
}

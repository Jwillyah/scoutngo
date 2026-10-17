/*
 * THE SUN MATH, RUN BACKWARDS.
 *
 * The app could already answer "where is the sun at 17:00". The question a
 * shooter actually has is the inverse: WHEN does the sun sit on this bearing,
 * or behind that building. Same arithmetic, solved the other way.
 *
 * No new data and no network. This is suncalc, already a dependency, sampled
 * and bisected.
 *
 * WHY SIGN CHANGES AND NOT A TOLERANCE SCAN. The obvious implementation walks
 * the range in fixed steps and keeps the samples whose bearing is within
 * tolerance. It silently misses things. The sun's azimuth moves about fifteen
 * degrees an hour, so a ten-minute step moves two and a half degrees, and a
 * one-degree tolerance describes a window about four minutes wide: a scan can
 * step straight over an exact alignment and report nothing at all. Tightening
 * the tolerance makes it WORSE, which is the opposite of what the control
 * implies.
 *
 * So the coarse pass looks for the SIGNED error changing sign, which happens
 * exactly once per crossing however narrow the tolerance is, and the crossing
 * is then bisected to the second. The tolerance is applied afterwards, to
 * decide which crossings to keep and how wide to report each window. A
 * tolerance of zero still finds every alignment.
 */

import { getPosition } from 'suncalc'
import type { LatLon } from './geo.ts'
import { normalizeBearing } from './sun.ts'

/** One alignment: the exact moment, and how long it holds within tolerance. */
export interface SunAimWindow {
  /** Closest approach to what was asked for. */
  at: Date
  /** While inside the tolerance. Equal to `at` when the tolerance is zero. */
  from: Date
  to: Date
  /** The sun's compass bearing at `at`. */
  azimuth: number
  /** Degrees above the horizon at `at`. Negative when the sun is down. */
  altitude: number
}

export interface SunAimQuery {
  at: LatLon
  from: Date
  to: Date
  /** Compass bearing the sun should sit on, or null to search altitude only. */
  bearing: number | null
  /** Degrees either side of the bearing that still counts. */
  bearingToleranceDeg?: number
  /** Optional: only alignments where the sun is also at this altitude. */
  altitudeDeg?: number | null
  /** Degrees either side of the altitude that still counts. */
  altitudeToleranceDeg?: number
  /** Coarse step. Only has to be fine enough to bracket a crossing. */
  stepMinutes?: number
  /**
   * Drop alignments with the sun below the horizon.
   *
   * Defaults to TRUE for a bearing search, because a bearing alignment with
   * the sun ten degrees underground casts nothing and lights nothing, and a
   * list full of them buries the ones that matter. An explicit altitude
   * search turns it off, since asking for -4 degrees is asking for a sun that
   * is down.
   */
  requireSunUp?: boolean
  /** Stop after this many, so a year-long range cannot return thousands. */
  limit?: number
}

/** Shortest signed turn from `a` to `b`, in (-180, 180]. */
export function signedBearingDelta(a: number, b: number): number {
  const d = ((normalizeBearing(b) - normalizeBearing(a) + 540) % 360) - 180
  return d === -180 ? 180 : d
}

const MINUTE_MS = 60_000

function sunAt(at: Date, where: LatLon): { azimuth: number; altitude: number } {
  const p = getPosition(at, where.lat, where.lon)
  return { azimuth: normalizeBearing(p.azimuth), altitude: p.altitude }
}

/**
 * THE QUANTITY WHOSE SIGN CHANGE MARKS A CROSSING.
 *
 * For a bearing search it is the signed turn from the sun to the target, which
 * passes through zero as the sun sweeps past. For an altitude-only search it
 * is the height above the requested altitude, which passes through zero as
 * the sun climbs or falls past it.
 */
function errorAt(at: Date, query: SunAimQuery): number {
  const sun = sunAt(at, query.at)
  if (query.bearing !== null) return signedBearingDelta(sun.azimuth, query.bearing)
  return sun.altitude - (query.altitudeDeg ?? 0)
}

/**
 * How far a moment misses, as a multiple of the tolerance it was given.
 *
 * Normalised so one number covers both constraints at once: at or under 1 is
 * inside tolerance on everything asked for. Without this the two tolerances
 * would need combining at every call site, in degrees of two different things.
 */
function missRatio(at: Date, query: SunAimQuery): number {
  const sun = sunAt(at, query.at)
  let worst = 0

  if (query.bearing !== null) {
    const tolerance = query.bearingToleranceDeg ?? 1
    const off = Math.abs(signedBearingDelta(sun.azimuth, query.bearing))
    worst = Math.max(worst, tolerance <= 0 ? (off === 0 ? 0 : Infinity) : off / tolerance)
  }

  const wantAltitude = query.altitudeDeg ?? null
  if (wantAltitude !== null) {
    const tolerance = query.altitudeToleranceDeg ?? 1
    const off = Math.abs(sun.altitude - wantAltitude)
    worst = Math.max(worst, tolerance <= 0 ? (off === 0 ? 0 : Infinity) : off / tolerance)
  }

  return worst
}

/** Bisect a bracketed sign change down to the second. */
function bisect(lo: number, hi: number, query: SunAimQuery): Date {
  let a = lo
  let b = hi
  let ea = errorAt(new Date(a), query)
  for (let i = 0; i < 48 && b - a > 1000; i += 1) {
    const mid = (a + b) / 2
    const em = errorAt(new Date(mid), query)
    if (em === 0) return new Date(mid)
    if (Math.sign(em) === Math.sign(ea)) {
      a = mid
      ea = em
    } else {
      b = mid
    }
  }
  return new Date(Math.round((a + b) / 2))
}

/**
 * Walk out from a crossing to the edge of the tolerance.
 *
 * Expands until the miss exceeds the tolerance, then bisects the bracket. The
 * expansion is capped at the coarse step because a window wider than the step
 * would have produced its own crossings at both ends anyway.
 */
function edge(centre: number, direction: 1 | -1, query: SunAimQuery, capMs: number): Date {
  if (missRatio(new Date(centre), query) > 1) return new Date(centre)

  let inside = centre
  let outside: number | null = null
  for (let span = 15_000; span <= capMs; span *= 2) {
    const probe = centre + direction * span
    if (missRatio(new Date(probe), query) > 1) {
      outside = probe
      break
    }
    inside = probe
  }
  if (outside === null) return new Date(inside)

  let a = inside
  let b = outside
  for (let i = 0; i < 32 && Math.abs(b - a) > 1000; i += 1) {
    const mid = (a + b) / 2
    if (missRatio(new Date(mid), query) > 1) b = mid
    else a = mid
  }
  return new Date(Math.round(a))
}

/**
 * WHEN THE SUN IS WHERE YOU ASKED.
 *
 * Returns one window per crossing, in time order. An empty array means no
 * alignment in the range, which is a real answer: at this latitude the sun may
 * simply never reach that bearing with any altitude above the horizon.
 */
export function sunAimTimes(query: SunAimQuery): SunAimWindow[] {
  const { from, to } = query
  if (!(from instanceof Date) || !(to instanceof Date)) return []
  const first = from.getTime()
  const last = to.getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return []
  if (query.bearing === null && (query.altitudeDeg ?? null) === null) return []

  const step = Math.max(1, query.stepMinutes ?? 10) * MINUTE_MS
  const limit = Math.max(1, query.limit ?? 200)
  const sunUp = query.requireSunUp ?? (query.bearing !== null && (query.altitudeDeg ?? null) === null)

  const out: SunAimWindow[] = []
  let previousTime = first
  let previousError = errorAt(from, query)

  for (let t = first + step; t <= last + step && out.length < limit; t += step) {
    const now = Math.min(t, last)
    const error = errorAt(new Date(now), query)

    /*
     * A genuine crossing, not the wrap at the back of the compass. When the
     * signed delta rolls over it jumps between +180 and -180, which is a sign
     * change with both magnitudes near 180; a real crossing has both near
     * zero. Without this guard every day produced a phantom alignment on the
     * bearing opposite the one asked for.
     */
    const crossed =
      Math.sign(error) !== Math.sign(previousError) &&
      Math.abs(error) + Math.abs(previousError) < 90

    if (crossed) {
      const at = bisect(previousTime, now, query)
      if (missRatio(at, query) <= 1) {
        const sun = sunAt(at, query.at)
        if (!sunUp || sun.altitude > 0) {
          out.push({
            at,
            from: edge(at.getTime(), -1, query, step),
            to: edge(at.getTime(), 1, query, step),
            azimuth: sun.azimuth,
            altitude: sun.altitude,
          })
        }
      }
    }

    previousTime = now
    previousError = error
    if (now === last) break
  }

  return out
}

/**
 * WHEN THE SUN GOES BEHIND A THING YOU POINTED AT.
 *
 * The same search, with the bearing taken from the pin to the tapped point.
 * Separate from sunAimTimes so the caller does not have to know that "behind
 * that building" and "on bearing 254" are the same question; this is where
 * that equivalence is written down.
 */
export function sunBehindTimes(
  input: Omit<SunAimQuery, 'bearing'> & { target: LatLon; bearingTo: (a: LatLon, b: LatLon) => number },
): SunAimWindow[] {
  return sunAimTimes({ ...input, bearing: input.bearingTo(input.at, input.target) })
}

/*
 * Tide. docs/brief.md roadmap item 5.
 *
 * WHY A WATERFRONT VENUE NEEDS THIS. The tide moves the waterline, changes how
 * much of a piling is standing out of the water, and decides whether a bank is
 * a beach or a mudflat. A plan made at high water and shot at low water is a
 * plan for a different place.
 *
 * WHAT THIS FILE DOES AND DOES NOT DO. It does arithmetic over NOAA's published
 * predictions: which station is nearest, what the level is at a given moment,
 * which way the water is moving, and whether the shoot window straddles a turn.
 *
 * It does NOT decide whether anywhere is walkable, safe, or worth standing on.
 * That is a judgement about a specific bank on a specific day, it depends on mud
 * and rip-rap and fences that no dataset here knows about, and the shooter is
 * the one standing there. The tool states the number and the direction. The
 * person decides.
 *
 * NEVER THROUGH THE MODEL, exactly like sun and cloud. A model asked for a tide
 * time is guessing at something NOAA publishes exactly. The model may be TOLD
 * the state as a fact, the same way it is told the sun's bearing, and it never
 * computes one and never asserts one that reaches the screen.
 */

import { distanceMeters, type LatLon } from './geo.ts'

export interface TideStation {
  id: string
  name: string
  at: LatLon
  state: string
}

/**
 * How far a station can be before it stops describing this water.
 *
 * Tide phase and range shift along an estuary, so a station is only ever an
 * approximation of somewhere else. These bands are a judgement about how much
 * approximation is worth reporting, and they are stated on screen rather than
 * applied quietly:
 *
 * - within LOCAL_KM: near enough to read as this venue's water.
 * - out to USABLE_KM: still the same system and worth showing, but the distance
 *   is put in front of the user, not buried.
 * - beyond that: not this water. Reported as no usable station, with the real
 *   distance, rather than a confident number about somewhere an hour away.
 */
export const STATION_LOCAL_KM = 20
export const STATION_USABLE_KM = 80

export type StationProximity = 'local' | 'distant' | 'none'

export interface NearestStation {
  station: TideStation
  distanceKm: number
  proximity: StationProximity
}

export function stationProximity(distanceKm: number): StationProximity {
  if (distanceKm <= STATION_LOCAL_KM) return 'local'
  if (distanceKm <= STATION_USABLE_KM) return 'distant'
  return 'none'
}

/**
 * The closest station to a venue. Returns it even when it is far away, with the
 * distance and the band, so the caller can say "the nearest is 340km away"
 * rather than silently showing nothing.
 */
export function nearestStation(
  venue: LatLon,
  stations: TideStation[],
): NearestStation | null {
  return nearestStations(venue, stations, 1)[0] ?? null
}

/**
 * The closest stations, nearest first.
 *
 * More than one is needed because "nearest" and "active" are not the same
 * thing. NOAA's list includes stations that publish no predictions against the
 * MLLW datum, and the API answers those with an error about the datum rather
 * than about the station. A venue on open water can have such a station as its
 * closest, and stopping there would report no tide at a place that plainly has
 * one. The caller walks this list and keeps the first that actually answers.
 */
export function nearestStations(
  venue: LatLon,
  stations: TideStation[],
  count: number,
): NearestStation[] {
  return stations
    .map((station) => {
      const distanceKm = distanceMeters(venue, station.at) / 1000
      return { station, distanceKm, proximity: stationProximity(distanceKm) }
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(0, count))
}

/** One published high or low water. */
export interface TideExtreme {
  at: Date
  /** Feet relative to MLLW, which is the datum NOAA predicts against. */
  feet: number
  kind: 'high' | 'low'
}

/** One point on the predicted water level curve. */
export interface TideSample {
  at: Date
  feet: number
}

export type TideDirection = 'rising' | 'falling' | 'slack'

/**
 * Within this many minutes of a published high or low, the water is called
 * slack rather than rising or falling. Around a turn the curve is flat and the
 * sign of the slope is noise, so naming a direction there would be false
 * precision.
 */
export const SLACK_WINDOW_MINUTES = 20

export interface TideState {
  feet: number
  direction: TideDirection
  /** The next high or low after this moment, if the day's predictions reach it. */
  next: TideExtreme | null
  /** The most recent high or low at or before this moment. */
  previous: TideExtreme | null
}

const FEET_TO_METRES = 0.3048

export const feetToMetres = (feet: number): number => feet * FEET_TO_METRES

/**
 * The water level at an arbitrary moment, interpolated between the two nearest
 * published samples.
 *
 * NOAA publishes the curve every six minutes, so linear interpolation across a
 * six minute gap is well inside the precision of the prediction itself. Null
 * when the moment is outside the samples: extrapolating a tide is inventing one.
 */
export function levelAt(curve: TideSample[], at: Date): number | null {
  if (curve.length === 0) return null
  const t = at.getTime()

  const first = curve[0]
  const last = curve[curve.length - 1]
  if (t < first.at.getTime() || t > last.at.getTime()) return null

  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]
    const b = curve[i]
    const ta = a.at.getTime()
    const tb = b.at.getTime()
    if (t >= ta && t <= tb) {
      if (tb === ta) return a.feet
      const share = (t - ta) / (tb - ta)
      return a.feet + (b.feet - a.feet) * share
    }
  }
  return last.feet
}

/**
 * Which way the water is moving, taken from the surrounding published extremes
 * rather than from the slope of the curve.
 *
 * Heading toward a high means rising, toward a low means falling. That is exact
 * and needs no threshold, where reading the slope of a nearly flat curve near a
 * turn would be guessing at the sign of noise.
 */
export function directionAt(extremes: TideExtreme[], at: Date): TideDirection {
  const t = at.getTime()
  const sorted = [...extremes].sort((a, b) => a.at.getTime() - b.at.getTime())

  const nearest = sorted.reduce<TideExtreme | null>((best, e) => {
    if (best === null) return e
    return Math.abs(e.at.getTime() - t) < Math.abs(best.at.getTime() - t) ? e : best
  }, null)
  if (nearest !== null) {
    const minutes = Math.abs(nearest.at.getTime() - t) / 60_000
    if (minutes <= SLACK_WINDOW_MINUTES) return 'slack'
  }

  const next = sorted.find((e) => e.at.getTime() > t)
  if (next !== undefined) return next.kind === 'high' ? 'rising' : 'falling'

  const previous = [...sorted].reverse().find((e) => e.at.getTime() <= t)
  // After the last published extreme, the water is heading away from it.
  if (previous !== undefined) return previous.kind === 'high' ? 'falling' : 'rising'
  return 'slack'
}

export function tideStateAt(
  curve: TideSample[],
  extremes: TideExtreme[],
  at: Date,
): TideState | null {
  const feet = levelAt(curve, at)
  if (feet === null) return null
  const sorted = [...extremes].sort((a, b) => a.at.getTime() - b.at.getTime())
  return {
    feet,
    direction: directionAt(sorted, at),
    next: sorted.find((e) => e.at.getTime() > at.getTime()) ?? null,
    previous: [...sorted].reverse().find((e) => e.at.getTime() <= at.getTime()) ?? null,
  }
}

/** Extremes inside the shoot window, plus the ones just either side of it. */
export function extremesAround(
  extremes: TideExtreme[],
  start: Date,
  end: Date,
): { inWindow: TideExtreme[]; before: TideExtreme | null; after: TideExtreme | null } {
  const sorted = [...extremes].sort((a, b) => a.at.getTime() - b.at.getTime())
  return {
    inWindow: sorted.filter(
      (e) => e.at.getTime() >= start.getTime() && e.at.getTime() <= end.getTime(),
    ),
    before: [...sorted].reverse().find((e) => e.at.getTime() < start.getTime()) ?? null,
    after: sorted.find((e) => e.at.getTime() > end.getTime()) ?? null,
  }
}

/**
 * Does the window contain a turn? A window that straddles one is shot at two
 * different waterlines, which is worth knowing before arriving.
 */
export function straddlesTurn(extremes: TideExtreme[], start: Date, end: Date): boolean {
  return extremesAround(extremes, start, end).inWindow.length > 0
}

/** Where an extreme falls across the scrubber, 0 at the start, 1 at the end. */
export function positionInWindow(at: Date, start: Date, end: Date): number | null {
  const span = end.getTime() - start.getTime()
  if (span <= 0) return null
  const share = (at.getTime() - start.getTime()) / span
  return share < 0 || share > 1 ? null : share
}

/** The range of the day, which is what says whether the tide matters here. */
export function tidalRangeFeet(extremes: TideExtreme[]): number {
  if (extremes.length === 0) return 0
  const feet = extremes.map((e) => e.feet)
  return Math.max(...feet) - Math.min(...feet)
}

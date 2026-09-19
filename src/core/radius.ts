/*
 * How far from the venue the shooter can actually get.
 *
 * WHY THIS IS A REAL CONSTRAINT AND NOT A PREFERENCE. Standoff used to be
 * inferred from focal length alone: a 600mm can frame a subject from four
 * hundred metres, so the plan assumed four hundred metres was available. At a
 * ticketed event, a fenced marina, or a bank with no public access, it is not.
 * A position outside the ring the shooter can reach is not a hard shot, it is an
 * impossible one, and no amount of correct optics arithmetic makes it reachable.
 *
 * So the ring is drawn by hand on the map, sent to the model as a hard ceiling,
 * and every returned position is checked against it here. Like every other
 * siting check in this project, a position outside it is REPORTED and never
 * moved: the shooter knows whether that far bank is walkable and the app does
 * not.
 */

import { distanceMeters, type LatLon } from './geo.ts'

/** A sensible default: about a five minute walk, and most of a venue. */
export const RADIUS_DEFAULT_METERS = 400

/**
 * The band the ring can be dragged through.
 *
 * The floor is not zero: a ring tighter than this describes standing on the
 * subject, and would reject every position including the good ones. The ceiling
 * is the practical standoff ground optics already have in fov.ts, past which
 * haze and lack of separation cost more than the reach buys.
 */
export const RADIUS_MIN_METERS = 25
export const RADIUS_MAX_METERS = 2000

export function clampRadius(meters: number): number {
  if (!Number.isFinite(meters)) return RADIUS_DEFAULT_METERS
  return Math.min(RADIUS_MAX_METERS, Math.max(RADIUS_MIN_METERS, Math.round(meters)))
}

/**
 * Slack on the ring edge, in metres.
 *
 * The geodesic forward and inverse are not exact inverses of each other: walking
 * 400m out and measuring back gives 400m plus about a nanometre. Without slack a
 * position placed exactly on the ring reads as outside it, which is the one
 * answer that is definitely wrong. A centimetre absorbs that completely and is
 * orders of magnitude below the GPS accuracy any of this is used with.
 */
export const RADIUS_EDGE_TOLERANCE_METERS = 0.01

/**
 * Is this position inside the ring?
 *
 * Inclusive of the edge: a strict test would reject the exact distance the
 * shooter deliberately dragged the ring to.
 */
export function isWithinRadius(
  venue: LatLon,
  at: LatLon,
  radiusMeters: number,
): boolean {
  return distanceMeters(venue, at) <= radiusMeters + RADIUS_EDGE_TOLERANCE_METERS
}

/** How far outside the ring a position sits, or 0 when it is inside. */
export function metersBeyondRadius(
  venue: LatLon,
  at: LatLon,
  radiusMeters: number,
): number {
  if (isWithinRadius(venue, at, radiusMeters)) return 0
  return distanceMeters(venue, at) - radiusMeters
}

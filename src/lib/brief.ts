import { distanceMeters, type LatLon } from '../core/geo.ts'

/**
 * The stale brief guard.
 *
 * The event description and the deliverable are written about ONE place. Move
 * the venue to a different town and that text is no longer a description of
 * anything, but it looks exactly as authoritative as it did before. That is how
 * a shoot at Atlantic Park came back as a plan for a boat docking contest.
 *
 * So the brief is anchored to the coordinate it was written about, and moving
 * far from that anchor is surfaced before anything can be generated. The text is
 * never cleared automatically: only the shooter knows whether it still applies.
 */
export const BRIEF_DRIFT_METERS = 500

export interface BriefAnchor {
  at: LatLon
}

export function briefHasText(event: string, outcome: string): boolean {
  return event.trim() !== '' || outcome.trim() !== ''
}

/**
 * True when there is brief text, an anchor, and the venue has moved far enough
 * that the text is probably about somewhere else.
 */
export function isBriefStale(
  anchor: BriefAnchor | null,
  venue: LatLon | null,
  event: string,
  outcome: string,
): boolean {
  if (anchor === null || venue === null) return false
  if (!briefHasText(event, outcome)) return false
  return distanceMeters(anchor.at, venue) > BRIEF_DRIFT_METERS
}

/** How far the venue has drifted, for showing the shooter the actual number. */
export function briefDriftMeters(anchor: BriefAnchor | null, venue: LatLon | null): number {
  if (anchor === null || venue === null) return 0
  return distanceMeters(anchor.at, venue)
}

export function formatDrift(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

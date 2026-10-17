/*
 * SOMEWHERE TO PULL OVER, IN ROUGHLY THE DIRECTION OF THE SUN.
 *
 * WHAT THIS SAYS AND WHAT IT REFUSES TO SAY. It says "open ground", meaning
 * OpenStreetMap has something mapped there that is water, beach, park,
 * farmland, meadow or parking. It does NOT say the view is clear, because this
 * app cannot know what is standing in the way: a treeline, a dune, a fence, a
 * row of houses on the far side of the field. Same rule as the hazard layer,
 * for the same reason. Say what is mapped; never claim clear.
 *
 * AND IT DOES NOT GO QUIET. An empty result is a sentence, not a blank space.
 * On this screen, at this moment, silence would be read as "nothing that way",
 * which is a claim about the world rather than about the map.
 */

import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { signedBearingDelta } from './sunInverse.ts'

/** What OSM had there. Not a ranking: a description. */
export type GroundKind = 'water' | 'beach' | 'park' | 'farmland' | 'meadow' | 'parking'

export interface GroundCandidate {
  kind: GroundKind
  /** The OSM name, when it has one. Most farmland does not. */
  name: string | null
  /** A representative point. A centroid is close enough at this scale. */
  at: LatLon
}

export interface OpenGroundHit extends GroundCandidate {
  meters: number
  miles: number
  /** Bearing from the viewer to it, carried for the planner. */
  bearing: number
}

/**
 * How far off the sun's bearing still counts as "that way".
 *
 * 45 degrees either side. Wide, deliberately: the sun moves along the horizon
 * as it sets, this is a driving decision rather than a composition, and a
 * narrow cone would reject the field one road over for being 50 degrees off
 * when turning the car fixes that.
 */
export const CONE_DEGREES = 45

/** A few miles. Past that it is not a pull-over, it is a different trip. */
export const MAX_METERS = 5000

const METERS_PER_MILE = 1609.344

/**
 * The nearest mapped open ground in roughly the sun's direction.
 *
 * NEAREST, NOT BEST. Ranking these by size or by kind would be inventing a
 * recommendation out of tags: a named park is not better than an unnamed field
 * for this, it is just better mapped. Distance is the only thing that decides
 * whether it is reachable in the minutes left, so distance is the only thing
 * that sorts.
 */
export function nearestOpenGround(
  from: LatLon,
  sunBearing: number,
  candidates: readonly GroundCandidate[],
  options: { maxMeters?: number; coneDegrees?: number } = {},
): OpenGroundHit | null {
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lon)) return null
  if (!Number.isFinite(sunBearing)) return null

  const maxMeters = options.maxMeters ?? MAX_METERS
  const cone = options.coneDegrees ?? CONE_DEGREES

  let best: OpenGroundHit | null = null
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.at.lat) || !Number.isFinite(candidate.at.lon)) continue
    const meters = distanceMeters(from, candidate.at)
    if (meters > maxMeters) continue
    /*
     * A candidate you are standing on has no useful bearing, and it is also
     * not somewhere to drive to. Ten metres is inside the noise of a centroid.
     */
    if (meters < 10) continue

    const bearing = bearingBetween(from, candidate.at)
    if (Math.abs(signedBearingDelta(bearing, sunBearing)) > cone) continue

    if (best === null || meters < best.meters) {
      best = { ...candidate, meters, miles: meters / METERS_PER_MILE, bearing }
    }
  }
  return best
}

/**
 * What to call it when OSM gave no name.
 *
 * Indefinite articles throughout: "a field" rather than "the field", because
 * the app has not identified a particular place, it has found a polygon. "The
 * field off Dam Neck Rd" is a thing a person says about somewhere they know;
 * this is a thing a map says about a tag.
 */
const KIND_PHRASE: Record<GroundKind, string> = {
  water: 'open water',
  beach: 'a beach',
  park: 'a park',
  farmland: 'a field',
  meadow: 'a meadow',
  parking: 'a car park',
}

/** Miles at the precision a driver can use. */
export function milesWords(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return '—'
  if (miles < 0.1) return 'under 0.1 mi'
  return `${miles.toFixed(1)} mi`
}

/**
 * THE LINE.
 *
 * "Nearest open ground that way: 0.4 mi, a beach" or, with a name,
 * "... 0.4 mi, Little Island Park".
 *
 * NEVER "clear view", "unobstructed", or "good spot". The phrase is "open
 * ground" and openGround.test.ts fails on the alternatives.
 */
export function openGroundSentence(hit: OpenGroundHit | null, searchedMiles: number): string {
  if (hit === null) {
    /*
     * SAYS WHAT WAS LOOKED FOR AND FOUND NOTHING. "Nothing mapped" rather
     * than "nothing there": the distinction is the whole honesty of the line,
     * because OSM coverage of farmland and meadow is patchy and an absence
     * here is an absence in the map.
     */
    return `No open ground mapped within ${milesWords(searchedMiles)} that way. That is the map being empty, not the ground.`
  }
  const what = hit.name ?? KIND_PHRASE[hit.kind]
  return `Nearest open ground that way: ${milesWords(hit.miles)}, ${what}.`
}

/**
 * The standing caveat, shown with any hit.
 *
 * Separate from the sentence so it cannot be dropped by a caller that only
 * wanted the distance.
 */
export const OPEN_GROUND_CAVEAT =
  'Open ground means something is mapped there, not that the horizon is visible from it.'

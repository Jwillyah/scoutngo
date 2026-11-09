/*
 * A NAME FOR A PIN FROM WHAT IS ON THE PHONE (E9, 8 Nov 2026).
 *
 * The map's title read "36.6623": the venue had no name of its own yet (the
 * lookup in flight, offline, or refused), venueLabel fell back to the
 * coordinate, and the short form cut it at the comma. Bundled data names
 * almost every US coast and town already: the coast cams' beaches and piers
 * (src/data/coastCams.ts) and 2478 weather stations named for their towns
 * (src/data/asosStations.ts). Nothing leaves the phone to find it.
 *
 * SAID AS WHAT IT IS. On top of a spot (within AT_KM) it is that spot's name;
 * further out it is "near Sandbridge"; past NEAR_KM it is nothing, and the
 * caller keeps the coordinate. A name for somewhere 40 km away is not a name
 * for this place.
 */
import { distanceMeters, type LatLon } from './geo.ts'

export interface NamedPoint {
  name: string
  at: LatLon
}

/** Within this, the pin is at the place: "Sandbridge". */
export const AT_KM = 1.5
/** Within this, the pin is near it: "near Sandbridge". Past it, no name. */
export const NEAR_KM = 25

/** The nearest named point within `maxKm`, and how far it is. */
export function nearestNamed(at: LatLon, places: readonly NamedPoint[], maxKm = NEAR_KM): { name: string; km: number } | null {
  let best: { name: string; km: number } | null = null
  for (const p of places) {
    const km = distanceMeters(at, p.at) / 1000
    if (km <= maxKm && (best === null || km < best.km)) best = { name: p.name, km }
  }
  return best
}

/**
 * The pin's name from bundled data: a spot it sits on, else "near" the nearest
 * spot or town, whichever is closer. Spots win a tie: a beach is the better
 * name at the coast. Null when nothing is within NEAR_KM.
 */
export function bundledPlaceName(at: LatLon, spots: readonly NamedPoint[], towns: readonly NamedPoint[]): string | null {
  const spot = nearestNamed(at, spots)
  if (spot !== null && spot.km <= AT_KM) return baseName(spot.name)
  const town = nearestNamed(at, towns)
  const best = spot === null ? town : town === null || spot.km <= town.km ? spot : town
  if (best === null) return null
  return best.km <= AT_KM ? baseName(best.name) : `near ${baseName(best.name)}`
}

/** "Wrightsville Beach, Johnnie Mercer's Pier" names its beach first; a title wants the first part. */
const baseName = (name: string): string => name.split(',')[0].trim()

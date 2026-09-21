/*
 * Arithmetic over geocoding results.
 *
 * WHY THIS EXISTS. Searching "atlantic park virginia beach" returned exactly one
 * Nominatim result, a neighbourhood four kilometres inland, and the app dropped
 * the pin on it without asking. One result is not the same thing as one right
 * answer: a gazetteer that knows a single feature by that name will return it
 * with the same confidence whether or not it is the place you meant.
 *
 * So results are merged from more than one source and near-duplicates collapsed,
 * which is the arithmetic here. Deciding which one is the venue is not arithmetic
 * and is never done automatically: see the confirm step in SetupMode.
 */

import { distanceMeters, type LatLon } from './geo.ts'

/**
 * Two gazetteers describing the same place rarely agree to the metre, and OSM
 * nodes for the same feature can sit tens of metres apart. Anything closer than
 * this is treated as one place rather than shown twice.
 */
export const DUPLICATE_WITHIN_METERS = 60

/**
 * Collapses results that describe the same place.
 *
 * ORDER IS THE RANKING and it is preserved: the first occurrence of a place
 * wins, so callers put their most trusted source first. Nothing is reordered,
 * because a merge that quietly re-ranks is a merge that can promote the wrong
 * answer to the top of a list someone is about to tap.
 */
export function dedupeNearby<T extends LatLon>(
  items: T[],
  withinMeters = DUPLICATE_WITHIN_METERS,
): T[] {
  const kept: T[] = []
  for (const item of items) {
    const duplicate = kept.some(
      (existing) => distanceMeters(existing, item) <= withinMeters,
    )
    if (!duplicate) kept.push(item)
  }
  return kept
}

/**
 * A box around a point, for biasing a search toward where the user is looking.
 *
 * Returned as [west, south, east, north], which is the order both Nominatim's
 * viewbox and every other bbox in this project use.
 */
export function biasBox(centre: LatLon, halfSpanMeters: number): [number, number, number, number] {
  const latDegrees = halfSpanMeters / 111_320
  // Longitude degrees shrink with latitude; guard the poles so this never blows up.
  const cos = Math.max(0.01, Math.cos((centre.lat * Math.PI) / 180))
  const lonDegrees = halfSpanMeters / (111_320 * cos)
  return [
    centre.lon - lonDegrees,
    centre.lat - latDegrees,
    centre.lon + lonDegrees,
    centre.lat + latDegrees,
  ]
}

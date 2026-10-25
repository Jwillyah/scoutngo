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

/* ------------------------------------------------------- what kind of place */

/*
 * A SHOOT VENUE IS SOMEWHERE YOU STAND.
 *
 * WHY THIS EXISTS. "atlantic park virginia beach" put the pin on a road
 * 3 km inland, 36.84328 -76.01080, and the tide came from Lake Rudee instead
 * of the NOAA station beside the surf park. Diagnosed, not guessed:
 *
 *   Mapbox    1st  "Atlantic Park"  feature_type neighborhood   (inland)
 *             the surf park is not in its list at all
 *   Nominatim 1st  "Atlantic Park"  place/neighbourhood  36.84348 -76.01049
 *   Photon    1st  "Atlantic Park"  place/neighbourhood  36.84348 -76.01049
 *             3rd  "Atlantic Park Surf"  club/sport  36.84658 -75.97666
 *
 * Every gazetteer ranked the residential NEIGHBOURHOOD of that name above the
 * venue, and the search box used Mapbox alone, which never had the venue. A
 * neighbourhood is an area on a map; nobody sets a tripod on one. So results
 * are classed by what they are, and a named venue -- a park, a pier, a club,
 * a business -- ranks above an area, which ranks above a road.
 *
 * RANKING, NOT CHOOSING. The list is reordered; the shooter still picks, and
 * the confirm step still asks. See dedupeNearby on why reordering is not done
 * quietly elsewhere: this is the one place it is done, on purpose, by a rule.
 */
export type PlaceKind = 'venue' | 'address' | 'area' | 'road' | 'other'

const PLACE_RANK: Record<PlaceKind, number> = { venue: 0, address: 1, other: 2, area: 3, road: 4 }

/** An OSM feature by its key and value: Nominatim's class/type, Photon's osm_key/osm_value. */
export function kindFromOsm(key: string, value: string): PlaceKind {
  if (key === 'highway' || key === 'railway') return 'road'
  if (key === 'boundary') return 'area'
  if (key === 'place') {
    return value === 'house' || value === 'building' ? 'address' : 'area'
  }
  if (key === 'building' && (value === 'house' || value === 'residential' || value === 'yes')) {
    return 'address'
  }
  if (key === '') return 'other'
  /* leisure, tourism, amenity, club, sport, natural, man_made, shop, historic... */
  return 'venue'
}

/** A Mapbox Search Box feature_type. */
export function kindFromMapbox(featureType: string): PlaceKind {
  switch (featureType) {
    case 'poi':
      return 'venue'
    case 'address':
      return 'address'
    case 'street':
      return 'road'
    case 'neighborhood':
    case 'locality':
    case 'place':
    case 'district':
    case 'region':
    case 'postcode':
    case 'country':
      return 'area'
    default:
      return 'other'
  }
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '')

/**
 * How many of the query's leading words the place's name starts with.
 *
 * "atlantic park virginia beach" against "Atlantic Park Surf" is 2, against
 * "Atlantic Fun Park" 1: both are venues, and the one whose name IS what was
 * typed comes first.
 */
export function leadingMatch(query: string, name: string): number {
  const q = words(query)
  const n = words(name)
  let count = 0
  while (count < q.length && count < n.length && q[count] === n[count]) count += 1
  return count
}

/** The name part of a label: everything before the first comma. */
const nameOf = (item: { name?: string; label?: string }): string =>
  (item.name ?? item.label ?? '').split(',')[0]

/**
 * Venues first, roads last. Within a kind, the name that starts with more of
 * what was typed; then the order the sources gave.
 */
export function rankForShoot<T extends { kind?: PlaceKind; name?: string; label?: string }>(
  items: readonly T[],
  query = '',
): T[] {
  return items
    .map((item, index) => ({ item, index, match: leadingMatch(query, nameOf(item)) }))
    .sort(
      (a, b) =>
        PLACE_RANK[a.item.kind ?? 'other'] - PLACE_RANK[b.item.kind ?? 'other'] ||
        b.match - a.match ||
        a.index - b.index,
    )
    .map(({ item }) => item)
}

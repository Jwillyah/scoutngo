/*
 * THE VENUE NAME IS A CACHE, NOT A FIELD.
 *
 * WHAT WAS WRONG. A venue carried coordinates and a name as two independent
 * values, so dragging the pin from Maryland to Shenandoah left the header
 * reading "Brew River Dock Bar". Two sources for one fact, and the usual
 * consequence: they disagreed, and nothing in the code could tell which one
 * was right.
 *
 * THE FIX IS NOT A SYNC. Clearing the name on a pin move would work until
 * somebody adds a second way to move the pin, and then it is a rule to
 * remember rather than a property of the data. Instead the name is stored
 * WITH THE COORDINATE IT WAS RESOLVED FOR. Reading it means asking "is this
 * name for this place", and a name for somewhere else simply is not returned.
 *
 * SO THERE IS NO THRESHOLD TO TUNE. The key is the coordinate text itself, not
 * a distance: any move at all changes it, the cache misses, and the name is
 * absent until it resolves. A "far enough to re-geocode" radius would be one
 * more number to argue about and one more way to be subtly stale.
 *
 * AND NO STALE NAME IS EVER SHOWN. The three states are a name, a lookup in
 * flight, and unknown. The old name is not one of them.
 */

/** A name, and the coordinate it was resolved for. */
export interface VenueName {
  /** placeKey of the coordinate this name belongs to. */
  key: string
  name: string
}

/**
 * The cache key: the coordinate text, exactly as the venue stores it.
 *
 * THE RAW TEXT, not a rounded number. The venue keeps coordinates as strings
 * so half-typed input does not fight the user, and using those strings means
 * the key changes exactly when the coordinate does -- no rounding, no epsilon,
 * nothing to get wrong at the boundary.
 */
export function placeKey(latitude: string, longitude: string): string {
  return `${latitude.trim()}|${longitude.trim()}`
}

/** What the app knows about this venue's name right now. */
export type ResolvedName =
  /** Resolved, and resolved for THIS coordinate. */
  | { kind: 'name'; name: string }
  /** A lookup is in flight. Show the coordinate. */
  | { kind: 'looking' }
  /** Nothing is known. Say so; do not reach for the last one. */
  | { kind: 'unknown' }

/**
 * The name for a coordinate, or why there isn't one.
 *
 * A CACHED NAME WHOSE KEY DOES NOT MATCH IS NOT A FALLBACK. It is a name for
 * somewhere else, and the whole point of this module is that it never leaks
 * out as this place's name.
 */
export function venueNameFor(
  cached: VenueName | null | undefined,
  latitude: string,
  longitude: string,
  looking: boolean,
): ResolvedName {
  const key = placeKey(latitude, longitude)
  if (cached != null && cached.key === key && cached.name.trim() !== '') {
    return { kind: 'name', name: cached.name }
  }
  return looking ? { kind: 'looking' } : { kind: 'unknown' }
}

/** The coordinate, formatted for the one place it is shown: while looking. */
export function coordinateLabel(latitude: string, longitude: string): string {
  /*
   * BLANK IS NOT ZERO. Number('') is 0 and 0 is finite, so a venue with no
   * coordinate rendered as "0.0000, 0.0000" -- Null Island, in the Gulf of
   * Guinea, printed with four decimal places as though it were a place the
   * shooter had chosen. Caught by its own test rather than in the field.
   */
  if (latitude.trim() === '' || longitude.trim() === '') return '—'
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '—'
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
}


/**
 * The line to put on screen.
 *
 * THE COORDINATE WHILE LOOKING, which is a true statement about where the pin
 * is, and the only thing the app actually knows at that moment. "Loading…" is
 * not more informative than the number it is loading a name for.
 */
export function venueLabel(
  state: ResolvedName,
  latitude: string,
  longitude: string,
): string {
  if (state.kind === 'name') return state.name
  /*
   * UNKNOWN IS THE COORDINATE TOO, never "Name unknown". On 27 Oct at Virginia
   * Beach the top bar said "Name unknown" all morning; the coordinate is a true
   * statement about where the pin is, and the name is asked for again until it
   * arrives (App.tsx, the name lookup).
   */
  return coordinateLabel(latitude, longitude)
}

/** The short form for tight places: everything before the first comma. */
export function shortVenueLabel(
  state: ResolvedName,
  latitude: string,
  longitude: string,
): string {
  const full = venueLabel(state, latitude, longitude)
  return full.split(',')[0]?.trim() || full
}

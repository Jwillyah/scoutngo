import { kindFromMapbox, type PlaceKind } from '../core/geocode.ts'
/**
 * Venue search through the Mapbox Search Box API.
 *
 * WHY MAPBOX IS THE PRIMARY. Nominatim and Photon are OpenStreetMap gazetteers
 * and they are good at addresses and poor at the names people actually use for
 * coastal places: measured here, "First Street Jetty Virginia Beach" returns
 * ZERO results from Nominatim. Small place names fail the same way. Mapbox
 * resolves them, and a search that cannot find the venue is a search that does
 * not work.
 *
 * NOT GOOGLE. Google Places would send every keystroke to Google and change the
 * privacy stance of this app far more than this does. See README.
 *
 * THE TOKEN STAYS SERVER SIDE. Everything here goes through /api/search, which
 * holds MAPBOX_TOKEN and logs nothing.
 *
 * WITHOUT A TOKEN THIS IS SIMPLY OFF, and src/lib/search.ts falls back to the
 * OSM pair. A fork with no Mapbox account still has a working search.
 */

import type { LatLon } from '../core/geo.ts'
import type { SearchHit } from './search.ts'

export const MAPBOX_ENDPOINT = '/api/search'

export const MAPBOX_ATTRIBUTION = 'Search by Mapbox'

/**
 * How long a typed query waits before it is sent.
 *
 * 300ms is the gap that reads as instant while still collapsing a burst of
 * typing into one request. The OSM path had to wait a full second for
 * Nominatim's published rate limit, which is why searching felt like waiting
 * rather than like a map.
 */
export const DEBOUNCE_MS = 300

/** Below this a query matches half the planet and the list is noise. */
export const MIN_QUERY_CHARS = 3

/**
 * One session covers a whole typed query.
 *
 * Mapbox bills per SESSION, not per request: every suggest sharing a token plus
 * the retrieve that ends it is one billable unit. A new one is minted when the
 * field is focused and kept until a result is picked, so twenty keystrokes cost
 * one search rather than twenty.
 */
export function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Only reached on a browser too old for randomUUID. Uniqueness is all that
  // matters here; this is a billing key, not a secret.
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface Suggestion {
  name?: unknown
  mapbox_id?: unknown
  place_formatted?: unknown
  feature_type?: unknown
}

/** A suggestion carries no coordinate: that is what retrieve is for. */
export interface MapboxSuggestion {
  id: string
  label: string
  /** The name alone, for matching against the same place from OSM. */
  name: string
  /** From feature_type: a neighbourhood is an area, a POI is a venue. */
  kind: PlaceKind
}

export type MapboxState =
  | { status: 'ok'; suggestions: MapboxSuggestion[] }
  | { status: 'no-token' }
  | { status: 'error'; message: string }

export function parseSuggestions(payload: unknown): MapboxSuggestion[] {
  const list = (payload as { suggestions?: unknown })?.suggestions
  if (!Array.isArray(list)) return []
  const out: MapboxSuggestion[] = []
  for (const entry of list.slice(0, 10)) {
    const item = entry as Suggestion
    if (typeof item?.mapbox_id !== 'string' || typeof item?.name !== 'string') continue
    const where = typeof item.place_formatted === 'string' ? item.place_formatted : ''
    out.push({
      id: item.mapbox_id,
      label: where === '' ? item.name : `${item.name}, ${where}`,
      name: item.name,
      kind: kindFromMapbox(typeof item.feature_type === 'string' ? item.feature_type : ''),
    })
  }
  return out
}

/**
 * The coordinate for one chosen suggestion.
 *
 * COORDINATES COME FROM HERE AND NOWHERE ELSE. The suggest list has none by
 * design, so there is no path where a label is shown next to a position it did
 * not come with.
 */
export function parseRetrieved(payload: unknown, fallbackLabel: string): SearchHit | null {
  const features = (payload as { features?: unknown })?.features
  if (!Array.isArray(features) || features.length === 0) return null
  const feature = features[0] as {
    geometry?: { coordinates?: unknown }
    properties?: Record<string, unknown>
  }
  const coords = feature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lon, lat] = coords
  if (typeof lon !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

  const props = feature.properties ?? {}
  const name = typeof props.name === 'string' ? props.name : fallbackLabel
  const where = typeof props.place_formatted === 'string' ? props.place_formatted : ''
  const id = typeof props.mapbox_id === 'string' ? props.mapbox_id : ''

  return {
    id: id === '' ? `mapbox-${lat.toFixed(5)},${lon.toFixed(5)}` : id,
    label: where === '' ? name : `${name}, ${where}`,
    lat,
    lon,
    source: 'mapbox',
    ...(id === '' ? {} : { placeId: id }),
  }
}

async function call(params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${MAPBOX_ENDPOINT}?${params.toString()}`, { signal })
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    // A bare `vite` dev server answers with the app's own HTML.
    return { status: 'error', message: 'The search function is not running. Use `vercel dev`.' }
  }
}

export async function mapboxSuggest(
  query: string,
  session: string,
  bias: LatLon | null,
  signal?: AbortSignal,
): Promise<MapboxState> {
  const params = new URLSearchParams({ action: 'suggest', q: query, session })
  if (bias !== null) {
    params.set('lat', bias.lat.toFixed(6))
    params.set('lon', bias.lon.toFixed(6))
  }
  const body = (await call(params, signal)) as {
    status?: unknown
    body?: unknown
    message?: unknown
  }
  if (body?.status === 'no-token') return { status: 'no-token' }
  if (body?.status !== 'ok') {
    return {
      status: 'error',
      message: typeof body?.message === 'string' ? body.message : 'Search failed.',
    }
  }
  return { status: 'ok', suggestions: parseSuggestions(body.body) }
}

export async function mapboxRetrieve(
  id: string,
  label: string,
  session: string,
  signal?: AbortSignal,
): Promise<SearchHit | null> {
  const params = new URLSearchParams({ action: 'retrieve', id, session })
  const body = (await call(params, signal)) as { status?: unknown; body?: unknown }
  if (body?.status !== 'ok') return null
  return parseRetrieved(body.body, label)
}

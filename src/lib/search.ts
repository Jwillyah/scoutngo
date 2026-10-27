import { dedupeNearby, biasBox, kindFromOsm, rankForShoot, type PlaceKind } from '../core/geocode.ts'
import type { LatLon } from '../core/geo.ts'
/**
 * Venue search through Nominatim.
 *
 * Their usage policy requires an application to identify itself and to stay
 * under one request per second.
 *
 * IDENTIFICATION: the policy accepts either a descriptive User-Agent or a valid
 * HTTP Referer. A browser will not let a page set User-Agent, it is a forbidden
 * header under the fetch spec and any attempt is silently dropped, so this
 * relies on the Referer the browser sends automatically. That is the identifying
 * mechanism Nominatim documents for web applications.
 *
 * RATE: MIN_INTERVAL_MS below, enforced on every call site through this module.
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
/*
 * PHOTON, as a second opinion.
 *
 * Also OpenStreetMap underneath, also free and keyless, but it indexes and
 * fuzzy-matches differently and returns alternatives where Nominatim returns
 * one exact-ish hit. The failure that put this here: "atlantic park virginia
 * beach" gave Nominatim a single result, a neighbourhood four kilometres
 * inland, while Photon also offered the oceanfront feature that was actually
 * meant.
 *
 * DELIBERATELY NOT GOOGLE PLACES. It would send every keystroke of every venue
 * search to Google, which is exactly the disclosure this project avoids
 * everywhere else.
 */
export const PHOTON_URL = 'https://photon.komoot.io/api/'
export const MIN_INTERVAL_MS = 1000
/** How far around the current view to prefer results from. */
export const BIAS_HALF_SPAN_METERS = 25_000
export const OSM_ATTRIBUTION =
  'Search by Nominatim and Photon, © OpenStreetMap contributors'

export interface SearchHit {
  id: string
  label: string
  lat: number
  lon: number
  /** Which gazetteer offered this, shown so a second opinion is visible as one. */
  source: 'osm' | 'photon' | 'mapbox'
  /**
   * The provider's own id for this place, when it has one.
   *
   * THIS IS WHAT STOPS DUPLICATE SAVED SPOTS. "Rodanthe" and "Rodanthe North
   * Carolina" are the same place reached two ways, and they come back on
   * slightly different coordinates, so matching on distance alone either
   * merges things that are not the same or fails to merge things that are.
   * A provider id is the provider saying "these are one place", which is a
   * stronger claim than two coordinates being close.
   *
   * Absent for a pin dropped by hand, which is correct: a hand-placed pin is
   * a position, not a gazetteer entry, and two of them near each other are
   * genuinely two different positions.
   */
  placeId?: string
  /** What sort of place: a venue ranks above an area. See rankForShoot in core/geocode.ts. */
  kind?: PlaceKind
}

/** Shape Nominatim returns, narrowed to what is used. */
interface NominatimRow {
  place_id?: unknown
  display_name?: unknown
  lat?: unknown
  lon?: unknown
  class?: unknown
  type?: unknown
}

export function parseSearchRows(rows: unknown): SearchHit[] {
  if (!Array.isArray(rows)) return []
  const hits: SearchHit[] = []
  for (const row of rows as NominatimRow[]) {
    const lat = Number(row.lat)
    const lon = Number(row.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (typeof row.display_name !== 'string') continue
    hits.push({
      id: String(row.place_id ?? `${lat},${lon}`),
      label: row.display_name,
      lat,
      lon,
      source: 'osm',
      kind: kindFromOsm(
        typeof row.class === 'string' ? row.class : '',
        typeof row.type === 'string' ? row.type : '',
      ),
    })
  }
  return hits.slice(0, 6)
}

/**
 * Where the user is looking, used to rank nearby matches first.
 *
 * Both services take a bias rather than a filter, so a venue outside the box is
 * still findable; it simply stops outranking one on the doorstep.
 */
export interface SearchBias {
  centre: LatLon
  /** Half the width of the box to prefer, in metres. */
  halfSpanMeters: number
}

export function searchUrl(query: string, bias?: SearchBias): string {
  const params = new URLSearchParams({ format: 'json', q: query, limit: '6' })
  if (bias !== undefined) {
    const [west, south, east, north] = biasBox(bias.centre, bias.halfSpanMeters)
    params.set('viewbox', `${west},${south},${east},${north}`)
    // 0 means prefer, not restrict: a venue outside the box is still findable.
    params.set('bounded', '0')
  }
  return `${NOMINATIM_URL}?${params.toString()}`
}

export function photonUrl(query: string, bias?: SearchBias): string {
  const params = new URLSearchParams({ q: query, limit: '6' })
  if (bias !== undefined) {
    params.set('lat', bias.centre.lat.toFixed(5))
    params.set('lon', bias.centre.lon.toFixed(5))
  }
  return `${PHOTON_URL}?${params.toString()}`
}

interface PhotonFeature {
  properties?: Record<string, unknown>
  geometry?: { coordinates?: unknown }
}

/** Photon answers GeoJSON, so the label has to be assembled from its parts. */
export function parsePhotonFeatures(payload: unknown): SearchHit[] {
  const features = (payload as { features?: unknown })?.features
  if (!Array.isArray(features)) return []

  const hits: SearchHit[] = []
  for (const feature of features as PhotonFeature[]) {
    const coordinates = feature.geometry?.coordinates
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue
    const lon = Number(coordinates[0])
    const lat = Number(coordinates[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const p = feature.properties ?? {}
    const text = (key: string): string =>
      typeof p[key] === 'string' ? (p[key] as string) : ''
    const label = [text('name'), text('street'), text('city'), text('state'), text('country')]
      .filter((part) => part !== '')
      .join(', ')
    if (label === '') continue

    hits.push({
      id: `photon-${String(p.osm_type ?? '')}${String(p.osm_id ?? `${lat},${lon}`)}`,
      label,
      lat,
      lon,
      source: 'photon',
      kind: kindFromOsm(text('osm_key'), text('osm_value')),
    })
  }
  return hits.slice(0, 6)
}

async function fromNominatim(query: string, bias?: SearchBias, signal?: AbortSignal) {
  const response = await fetch(searchUrl(query, bias), {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return []
  return parseSearchRows(await response.json())
}

/** Photon alone: no published rate rule, so it can run beside Mapbox. */
export async function fromPhoton(query: string, bias?: SearchBias, signal?: AbortSignal) {
  const response = await fetch(photonUrl(query, bias), { signal })
  if (!response.ok) return []
  return parsePhotonFeatures(await response.json())
}

/**
 * Both gazetteers, merged.
 *
 * Queried in parallel and merged with Nominatim first, because it is the more
 * conservative of the two and its hits are usually the canonical feature. Near
 * duplicates collapse in src/core/geocode.ts. Either source failing is not an
 * error: one good list is better than none, and the user still confirms the pin
 * either way.
 */
export async function searchVenues(
  query: string,
  signal?: AbortSignal,
  bias?: SearchBias,
): Promise<SearchHit[]> {
  const [osm, photon] = await Promise.all([
    fromNominatim(query, bias, signal).catch(() => []),
    fromPhoton(query, bias, signal).catch(() => []),
  ])
  /* Venues before areas before roads: see rankForShoot in src/core/geocode.ts. */
  return rankForShoot(dedupeNearby([...osm, ...photon]), query).slice(0, 8)
}

/*
 * ONE CLOCK FOR NOMINATIM.
 *
 * The one-request-per-second cap is per application, not per text box. Search
 * and reverse geocoding both go to the same server, so both read and stamp
 * this one clock rather than each keeping its own and together going over.
 */
let lastNominatimAt = 0

/** How long to wait before the next Nominatim request may go out. */
export function msUntilNominatim(now: number = Date.now()): number {
  return Math.max(0, MIN_INTERVAL_MS - (now - lastNominatimAt))
}

/** Stamp the clock. Called the moment a request actually leaves. */
export function markNominatim(now: number = Date.now()): void {
  lastNominatimAt = now
}

export const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

/*
 * What the name says when nothing better is known: offline, a timeout, or a pin
 * in open water. Plain on purpose. It is a label to overwrite, not a claim.
 */
export const PINNED_PLACEHOLDER = 'Dropped pin'

export function reverseUrl(at: LatLon): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: at.lat.toFixed(6),
    lon: at.lon.toFixed(6),
    zoom: '18',
    addressdetails: '1',
  })
  return `${NOMINATIM_REVERSE_URL}?${params.toString()}`
}

/**
 * A reverse geocode answer as a venue name, or null when there is nothing
 * usable.
 *
 * Short on purpose: the feature's own name (a bar, a park, a pier), or failing
 * that the street address, then the town. The full display_name runs to county,
 * postcode and country, which is not a name anybody would give a venue.
 */
export function parseReverse(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const row = payload as { name?: unknown; display_name?: unknown; address?: unknown }
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  const address =
    typeof row.address === 'object' && row.address !== null
      ? (row.address as Record<string, unknown>)
      : {}

  const street = [text(address.house_number), text(address.road)].filter(Boolean).join(' ')
  /* No feature name and no street (a jetty, open water): the area, "Rudee Inlet, Virginia Beach". */
  const area =
    text(address.water) ||
    text(address.bay) ||
    text(address.natural) ||
    text(address.neighbourhood) ||
    text(address.quarter) ||
    text(address.suburb)
  const head = text(row.name) || street || area
  const town =
    text(address.city) ||
    text(address.town) ||
    text(address.village) ||
    text(address.hamlet) ||
    text(address.suburb)

  if (head !== '') return town === '' || town === head ? head : `${head}, ${town}`
  const display = text(row.display_name)
  if (display === '') return town === '' ? null : town
  return display.split(',').slice(0, 2).map((part) => part.trim()).join(', ')
}

/**
 * Names a coordinate. Never throws and never hangs: any failure, including the
 * timeout, comes back as null and the caller keeps its placeholder.
 */
export async function reverseGeocode(
  at: LatLon,
  signal?: AbortSignal,
  timeoutMs = 6000,
): Promise<string | null> {
  /* Not AbortSignal.any: older Safari lacks it, and this must never hang there. */
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)
  const timer = setTimeout(abort, timeoutMs)
  try {
    markNominatim()
    const response = await fetch(reverseUrl(at), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return parseReverse(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

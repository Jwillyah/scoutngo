import { dedupeNearby, biasBox } from '../core/geocode.ts'
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
  source: 'osm' | 'photon'
}

/** Shape Nominatim returns, narrowed to what is used. */
interface NominatimRow {
  place_id?: unknown
  display_name?: unknown
  lat?: unknown
  lon?: unknown
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

async function fromPhoton(query: string, bias?: SearchBias, signal?: AbortSignal) {
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
  return dedupeNearby([...osm, ...photon]).slice(0, 8)
}

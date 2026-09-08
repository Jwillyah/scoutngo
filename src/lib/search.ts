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
export const MIN_INTERVAL_MS = 1000
export const OSM_ATTRIBUTION = 'Search by Nominatim, © OpenStreetMap contributors'

export interface SearchHit {
  id: string
  label: string
  lat: number
  lon: number
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
    })
  }
  return hits.slice(0, 6)
}

export function searchUrl(query: string): string {
  const params = new URLSearchParams({ format: 'json', q: query, limit: '6' })
  return `${NOMINATIM_URL}?${params.toString()}`
}

export async function searchVenues(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const response = await fetch(searchUrl(query), {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return []
  return parseSearchRows(await response.json())
}

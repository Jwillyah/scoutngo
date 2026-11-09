/*
 * SEARCH v2's GEOCODERS (Batch Map, Section 2). Only the typed words go out
 * (the region words left out, src/core/spotSearch.ts parseQuery): no
 * position, no bias. More rows than are shown (20 from each), US only, and
 * OpenStreetMap's own class and type kept, so the phone can group them
 * (beaches, towns, businesses) and sort them by distance itself.
 */
import { msUntilNominatim, markNominatim, NOMINATIM_URL, PHOTON_URL } from './search.ts'
import type { GeoRow } from '../core/spotSearch.ts'

export const ROWS_ASKED = 20

const s = (v: unknown) => (typeof v === 'string' ? v : '')

export function photonRows(payload: unknown): GeoRow[] {
  const features = (payload as { features?: unknown })?.features
  if (!Array.isArray(features)) return []
  return features.flatMap((f: { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }) => {
    const c = f.geometry?.coordinates
    const p = f.properties ?? {}
    if (!Array.isArray(c) || c.length < 2 || s(p.name) === '') return []
    if (s(p.countrycode) !== '' && s(p.countrycode).toUpperCase() !== 'US') return []
    const where = [s(p.city) || s(p.county), s(p.state)].filter((x) => x !== '').join(', ')
    return [{ id: `p${s(p.osm_type)}${String(p.osm_id ?? '')}`, name: s(p.name), where, at: { lat: Number(c[1]), lon: Number(c[0]) }, osmKey: s(p.osm_key), osmValue: s(p.osm_value) }]
  })
}

export function nominatimRows(payload: unknown): GeoRow[] {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((r: Record<string, unknown>) => {
    const lat = Number(r.lat)
    const lon = Number(r.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
    const parts = s(r.display_name).split(',').map((x) => x.trim())
    const name = s(r.name) || parts[0] || ''
    if (name === '') return []
    return [{ id: `n${String(r.osm_type ?? '')}${String(r.osm_id ?? '')}`, name, where: parts.slice(1, 4).filter((x) => !/county|united states|^\d/i.test(x)).slice(0, 2).join(', '), at: { lat, lon }, osmKey: s(r.class), osmValue: s(r.type) }]
  })
}

export type GeoAnswer = { status: 'ok'; rows: GeoRow[] } | { status: 'failed' } | { status: 'aborted' }

export async function geocodeWords(text: string, signal?: AbortSignal): Promise<GeoAnswer> {
  if (text.trim() === '') return { status: 'ok', rows: [] }
  const ask = async (url: string, parse: (b: unknown) => GeoRow[]): Promise<GeoRow[] | null> => {
    try {
      const r = await fetch(url, { signal, headers: { Accept: 'application/json' } })
      return r.ok ? parse(await r.json()) : null
    } catch {
      return null
    }
  }
  const nominatim = async () => {
    const gap = msUntilNominatim()
    if (gap > 0) await new Promise((r) => setTimeout(r, gap))
    if (signal?.aborted === true) return null
    markNominatim()
    return ask(`${NOMINATIM_URL}?${new URLSearchParams({ format: 'json', q: text, limit: String(ROWS_ASKED), countrycodes: 'us' })}`, nominatimRows)
  }
  const [a, b] = await Promise.all([nominatim(), ask(`${PHOTON_URL}?${new URLSearchParams({ q: text, limit: String(ROWS_ASKED) })}`, photonRows)])
  if (signal?.aborted === true) return { status: 'aborted' }
  if (a === null && b === null) return { status: 'failed' }
  return { status: 'ok', rows: [...(a ?? []), ...(b ?? [])] }
}

/*
 * SEARCH v2's GEOCODERS (Batch Map, Section 2). Only the typed words go out
 * (the region words left out, src/core/spotSearch.ts parseQuery): no
 * position, no bias. More rows than are shown (20 from each), US only, and
 * OpenStreetMap's own class and type kept, so the phone can group them
 * (beaches, towns, businesses) and sort them by distance itself.
 */
import { msUntilNominatim, markNominatim, NOMINATIM_URL, PHOTON_URL } from './search.ts'
import { sameHouse, type Address, type GeoAsk, type GeoRow } from '../core/spotSearch.ts'
import { distanceMeters } from '../core/geo.ts'
import { spotKind, type KnownSpot } from '../core/knownSpots.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { SURF_SPOTS, type SurfSpot } from '../data/surfSpots.ts'

/*
 * THE PICKER'S OWN LISTS, here rather than in the component (Batch SIMPLE-1,
 * Section 2) so tests/searchAddress.test.ts searches exactly what the picker
 * searches.
 */
/* One row a place: two cams at the same pier under one name were two rows (Batch QA, Section 1). */
export const PICKER_KNOWN: KnownSpot[] = COAST_CAMS.filter((c, i) => COAST_CAMS.findIndex((d) => d.name === c.name && Math.abs(d.at.lat - c.at.lat) < 0.003 && Math.abs(d.at.lon - c.at.lon) < 0.003) === i).map((c) => ({ id: c.id, name: c.name, at: c.at, facing: c.facing, state: c.state }))
/* Batch Map, Section 2: our own spots to search, the surf spots with their aliases first, then the cams' beaches and piers. */
export const PICKER_SPOTS: SurfSpot[] = [
  ...SURF_SPOTS,
  /* A cam within 500 m of one of our spots is that spot (Batch Beach, Section 1: "Rodanthe, S-Turns" and "S-Turns" were two rows). */
  ...PICKER_KNOWN.filter((k) => !SURF_SPOTS.some((s) => distanceMeters(s.at, k.at) <= 500)).map((k) => ({ id: k.id, name: k.name.split(',')[0].trim(), aliases: [k.name], town: k.name.split(',')[1]?.trim() ?? '', state: k.state ?? '', at: k.at, facing: k.facing ?? 90, kind: spotKind(k.name) === 'pier' ? ('pier' as const) : ('surf' as const) })),
]

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

/** `addresses`: the houses matched by number (Batch SIMPLE-1, Section 2), shown first; empty for a search by name. */
export type GeoAnswer = { status: 'ok'; rows: GeoRow[]; addresses: GeoRow[] } | { status: 'failed' } | { status: 'aborted' }

/** One request, its rows, or null when it did not answer. */
async function ask<T>(url: string, parse: (b: unknown) => T[], signal?: AbortSignal): Promise<T[] | null> {
  try {
    const r = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    return r.ok ? parse(await r.json()) : null
  } catch {
    return null
  }
}

/** Nominatim, after its one-a-second clock (src/lib/search.ts). */
async function askNominatim<T>(params: Record<string, string>, parse: (b: unknown) => T[], signal?: AbortSignal): Promise<T[] | null> {
  const gap = msUntilNominatim()
  if (gap > 0) await new Promise((r) => setTimeout(r, gap))
  if (signal?.aborted === true) return null
  markNominatim()
  return ask(`${NOMINATIM_URL}?${new URLSearchParams({ format: 'json', limit: String(ROWS_ASKED), countrycodes: 'us', ...params })}`, parse, signal)
}

export const photonUrlFor = (text: string): string => `${PHOTON_URL}?${new URLSearchParams({ q: text, limit: String(ROWS_ASKED) })}`

export async function geocodeWords(text: string, signal?: AbortSignal): Promise<GeoAnswer> {
  if (text.trim() === '') return { status: 'ok', rows: [], addresses: [] }
  const [a, b] = await Promise.all([askNominatim({ q: text }, nominatimRows, signal), ask(photonUrlFor(text), photonRows, signal)])
  if (signal?.aborted === true) return { status: 'aborted' }
  if (a === null && b === null) return { status: 'failed' }
  return { status: 'ok', rows: [...(a ?? []), ...(b ?? [])], addresses: [] }
}

/*
 * AN ADDRESS (Batch SIMPLE-1, Section 2). The typed string as it was typed,
 * commas and all, and nothing else: no position, no bias, no box. Photon
 * first; Nominatim only when Photon has not got the house; then the same two
 * with the name in front dropped ("Pub, 425 E Pinner St" is "425 E Pinner
 * St"). A house is the one asked for when its number is the typed number and
 * its street shares a word with the typed street; nothing else is shown as
 * the address. When no house matches, the words are searched as before, so
 * "2 Mile Beach, NC" still finds the beach.
 */
interface House {
  row: GeoRow
  number: string
  street: string
}

const STATE: Record<string, string> = { Virginia: 'VA', 'North Carolina': 'NC', Maryland: 'MD', 'South Carolina': 'SC', Delaware: 'DE' }
const place = (town: string, state: string) => [town, STATE[state] ?? state].filter((x) => x !== '').join(', ')

/** A house the way the picker shows it: a name when it has one, the street address under it. */
function houseRow(id: string, at: GeoRow['at'], name: string, number: string, street: string, town: string, state: string, osmKey: string, osmValue: string): House {
  const line = [number, street].filter((x) => x !== '').join(' ')
  return { row: { id, name: name || line, where: name === '' ? place(town, state) : [line, town].filter((x) => x !== '').join(', '), at, osmKey, osmValue }, number, street }
}

export function photonHouses(payload: unknown): House[] {
  const features = (payload as { features?: unknown })?.features
  if (!Array.isArray(features)) return []
  return features.flatMap((f: { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }) => {
    const c = f.geometry?.coordinates
    const p = f.properties ?? {}
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) return []
    if (s(p.countrycode).toUpperCase() !== 'US' || s(p.housenumber) === '') return []
    return [houseRow(`pa${s(p.osm_type)}${String(p.osm_id ?? '')}`, { lat: Number(c[1]), lon: Number(c[0]) }, s(p.name), s(p.housenumber), s(p.street), s(p.city) || s(p.town) || s(p.county), s(p.state), s(p.osm_key), s(p.osm_value))]
  })
}

export function nominatimHouses(payload: unknown): House[] {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((r: Record<string, unknown>) => {
    const lat = Number(r.lat)
    const lon = Number(r.lon)
    const a = typeof r.address === 'object' && r.address !== null ? (r.address as Record<string, unknown>) : {}
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || s(a.house_number) === '') return []
    return [houseRow(`na${String(r.osm_type ?? '')}${String(r.osm_id ?? '')}`, { lat, lon }, s(r.name), s(a.house_number), s(a.road), s(a.city) || s(a.town) || s(a.village) || s(a.hamlet), s(a.state), s(r.class), s(r.type))]
  })
}

/** `words`: what the search by words would send (parseQuery's geocoderText), asked when no house matches. */
export async function geocodeAddress(address: Address, words: string, signal?: AbortSignal): Promise<GeoAnswer> {
  let answered = false
  /* A function, so the check after each await is read afresh. */
  const stopped = () => signal?.aborted === true
  const houses = (got: House[] | null): GeoRow[] => {
    if (got !== null) answered = true
    const out: GeoRow[] = []
    /* One house once: the building and the pub in it are one pin, and three rows of one name and line are one row. */
    for (const h of got ?? []) if (sameHouse(address, h.number, h.street) && !out.some((o) => distanceMeters(o.at, h.row.at) < 30 || (o.name === h.row.name && o.where === h.row.where))) out.push(h.row)
    return out
  }
  for (const text of [address.full, ...(address.bare === null ? [] : [address.bare])]) {
    const photon = houses(await ask(photonUrlFor(text), photonHouses, signal))
    if (stopped()) return { status: 'aborted' }
    if (photon.length > 0) return { status: 'ok', rows: [], addresses: photon }
    const osm = houses(await askNominatim({ q: text, addressdetails: '1' }, nominatimHouses, signal))
    if (stopped()) return { status: 'aborted' }
    if (osm.length > 0) return { status: 'ok', rows: [], addresses: osm }
  }
  /* No house by that number: the words, as any other search. */
  const byWords = await geocodeWords(words, signal)
  return byWords.status === 'failed' && answered ? { status: 'ok', rows: [], addresses: [] } : byWords
}

/** The spot picker's question, asked (src/core/spotSearch.ts geoAsk). */
export function geocodeAsk(a: GeoAsk, signal?: AbortSignal): Promise<GeoAnswer> {
  return a.kind === 'address' ? geocodeAddress(a.address, a.text, signal) : geocodeWords(a.text, signal)
}

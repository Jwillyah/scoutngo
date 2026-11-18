/*
 * THE SPOT PICKER'S SEARCH, RUN OUTSIDE THE PICKER (Batch SIMPLE-1, Section 2).
 *
 * The same calls src/components/SpotPicker.tsx makes, in the same order, over
 * the same lists: the words parsed, our spots searched on the phone, the
 * geocoders asked (an address when the words are one and nothing here
 * matched), the answer ranked. Used by tests/searchAddress.test.ts against
 * saved answers and by scripts/measure-search-address.mjs to record them.
 */
import { distanceMeters, type LatLon } from '../src/core/geo.ts'
import { geoAsk, localPool, ownSpots, parseQuery, rankResults, type Result } from '../src/core/spotSearch.ts'
import { geocodeAsk, PICKER_SPOTS } from '../src/lib/spotSearchData.ts'

export interface PickerRun {
  results: Result[]
  /** 'address' or 'words': what the picker asked; null when it asked nothing. */
  asked: 'address' | 'words' | null
  status: 'ok' | 'failed' | 'aborted' | 'not asked'
}

/** One search, first run (no saved spots, no cached map spots, no position). */
export async function runPicker(raw: string): Promise<PickerRun> {
  const q = parseQuery(raw)
  const own = ownSpots(q, null, PICKER_SPOTS, localPool([], []))
  const a = geoAsk(raw, own.length > 0)
  if (a === null) return { results: rankResults(q, own, [], null), asked: null, status: 'not asked' }
  const answer = await geocodeAsk(a)
  const ok = answer.status === 'ok' ? answer : null
  return { results: rankResults(q, own, ok?.rows ?? [], null, ok?.addresses ?? []), asked: a.kind, status: answer.status }
}

/** An ArcGIS polygon: rings of [lon, lat], even-odd. */
export type Rings = number[][][]

export function insideRings(at: LatLon, rings: Rings): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > at.lat !== yj > at.lat && at.lon < ((xj - xi) * (at.lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/** Inside any one of the place's polygons (PAD-US lists a unit once a state and once a manager). */
export const insidePolygons = (at: LatLon, polygons: readonly Rings[]): boolean => polygons.some((p) => insideRings(at, p))

/** How far a point is from the nearest vertex of the boundary, metres: for the table when it is outside. */
export function nearestVertexMeters(at: LatLon, polygons: readonly Rings[]): number {
  let best = Infinity
  for (const rings of polygons) for (const ring of rings) for (const [lon, lat] of ring) best = Math.min(best, distanceMeters(at, { lat, lon }))
  return best
}

/** The saved run: each query, its truth and every answer the geocoders gave it. */
export interface AddressCase {
  query: string
  kind: 'address' | 'place'
  /** An address: the local address point (`at`), the Census point beside it. A name: its boundary. */
  truth: { source: string; url: string; at?: LatLon; matched?: string; census?: { url: string; at: LatLon; matched: string }; polygons?: Rings[]; name?: string }
  /** URL asked → the JSON body that came back. */
  responses: Record<string, unknown>
}

export interface AddressFixture {
  recorded: string
  userAgent: string
  toleranceMeters: number
  cases: AddressCase[]
}

/** fetch, answered from the saved bodies; an unsaved URL is a failure that names it. */
export function replayFetch(cases: readonly AddressCase[], asked: string[] = []): typeof fetch {
  const all = new Map<string, unknown>()
  for (const c of cases) for (const [u, body] of Object.entries(c.responses)) all.set(u, body)
  return (async (input: RequestInfo | URL) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(href)
    if (!all.has(href)) throw new TypeError(`no saved answer for ${href}`)
    return new Response(JSON.stringify(all.get(href)), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

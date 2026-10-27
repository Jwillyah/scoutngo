/*
 * ASKING OVERPASS WHAT IS OPEN NEARBY.
 *
 * SEPARATE FROM fetchSiteGeometry, which asks a different question. That one
 * asks "what is on this site" over a map viewport, and returns buildings,
 * roads and power lines because it is feeding a siting decision. This asks
 * "where could I stand" over a few miles of road network, and wants only the
 * open things.
 *
 * WHAT GOES TO OVERPASS. A bounding box a few miles across. That is the
 * venue coordinate, rounded, leaving the device: the same trade the site
 * geometry and the forecast already make, and the reason the NOW screen asks
 * for a location on a tap rather than holding one. Nothing is stored. There is
 * no key and no account.
 *
 * ROUNDED, AND WHY THAT IS NOT SECURITY THEATRE. The box is snapped to a
 * coarse grid before it is sent, so two glances from the same neighbourhood
 * produce the same query and the same cache key. It does not hide where you
 * are from Overpass, which gets a box containing you; it does mean the exact
 * fix is not in the request, and it keeps a slow drive from generating a
 * request per minute.
 */

import type { GroundCandidate, GroundKind } from '../core/openGround.ts'
import type { LatLon } from '../core/geo.ts'
import { MIN_INTERVAL_MS, TIMEOUT_MS, type OverpassElement } from './overpass.ts'
import { askOverpass } from './overpassClient.ts'

/** A few miles, as degrees of latitude. About 5km. */
const HALF_SPAN_DEG = 0.045

/** Snap to about 2km, so a slow drive is one query rather than many. */
const GRID = 0.02

const snap = (value: number) => Math.round(value / GRID) * GRID

/**
 * The tags that count as open.
 *
 * WATER, BEACH, PARK, FARMLAND, MEADOW, PARKING, which is what was asked for.
 * No `natural=scrub`, no `landuse=forest`: those are mapped as open land and
 * are the least likely to have a horizon in them.
 *
 * `out center` rather than `out geom`, because this needs one point per thing
 * to measure a distance and a bearing to. A full ring for every field within
 * three miles is tens of thousands of points for an answer that is one line.
 */
export function buildOpenGroundQuery(at: LatLon): string {
  const south = (snap(at.lat) - HALF_SPAN_DEG).toFixed(4)
  const north = (snap(at.lat) + HALF_SPAN_DEG).toFixed(4)
  /* Longitude degrees shrink with latitude, so the box stays roughly square. */
  const lonScale = Math.max(0.2, Math.cos((at.lat * Math.PI) / 180))
  const west = (snap(at.lon) - HALF_SPAN_DEG / lonScale).toFixed(4)
  const east = (snap(at.lon) + HALF_SPAN_DEG / lonScale).toFixed(4)
  const bbox = `${south},${west},${north},${east}`

  return `[out:json][timeout:20];
(
  way["natural"="water"](${bbox});
  way["natural"="beach"](${bbox});
  way["leisure"="park"](${bbox});
  way["landuse"="farmland"](${bbox});
  way["landuse"="meadow"](${bbox});
  way["natural"="grassland"](${bbox});
  way["amenity"="parking"](${bbox});
);
out center tags;`
}

/** Which tag made it a candidate. First match wins, most open first. */
function kindOf(tags: Record<string, string>): GroundKind | null {
  if (tags.natural === 'water') return 'water'
  if (tags.natural === 'beach') return 'beach'
  if (tags.leisure === 'park') return 'park'
  if (tags.landuse === 'farmland') return 'farmland'
  if (tags.landuse === 'meadow' || tags.natural === 'grassland') return 'meadow'
  if (tags.amenity === 'parking') return 'parking'
  return null
}

/** Tolerant of anything: a bad payload is no candidates, never a throw. */
export function parseOpenGround(payload: unknown): GroundCandidate[] {
  if (typeof payload !== 'object' || payload === null) return []
  const elements = (payload as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return []

  const out: GroundCandidate[] = []
  for (const raw of elements as OverpassElement[]) {
    const tags = raw.tags
    if (typeof tags !== 'object' || tags === null) continue
    const kind = kindOf(tags)
    if (kind === null) continue

    /* `out center` puts the representative point on a `center` property. */
    const centre = (raw as { center?: { lat?: unknown; lon?: unknown } }).center
    const lat = typeof centre?.lat === 'number' ? centre.lat : raw.lat
    const lon = typeof centre?.lon === 'number' ? centre.lon : raw.lon
    if (typeof lat !== 'number' || typeof lon !== 'number') continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const name = typeof tags.name === 'string' && tags.name.trim() !== '' ? tags.name.trim() : null
    out.push({ kind, name, at: { lat, lon } })
  }
  return out
}

export type OpenGroundResult =
  | { status: 'ok'; candidates: GroundCandidate[]; cached: boolean }
  | { status: 'unavailable'; reason: string }

const cache = new Map<string, GroundCandidate[]>()
let lastCallAt = 0

export function clearOpenGroundCache(): void {
  cache.clear()
  lastCallAt = 0
}

/**
 * Never throws. Overpass being down is a sentence on the screen, not a blank.
 */
export async function fetchOpenGround(at: LatLon): Promise<OpenGroundResult> {
  const key = `${snap(at.lat).toFixed(3)},${snap(at.lon).toFixed(3)}`
  const hit = cache.get(key)
  if (hit !== undefined) return { status: 'ok', candidates: hit, cached: true }

  const since = Date.now() - lastCallAt
  if (lastCallAt !== 0 && since < MIN_INTERVAL_MS) {
    return { status: 'unavailable', reason: 'Overpass was queried moments ago.' }
  }

  lastCallAt = Date.now()
  /*
   * A TIMEOUT AND A REFUSAL ARE DIFFERENT THINGS TO SAY. overpass-api.de
   * answering 406 arrives in the browser as a network error (an nginx error
   * page carries no CORS headers), and calling that a timeout sends somebody
   * to check their signal when the service turned them down. The client
   * (overpassClient.ts) says "did not answer in time" only for a timeout.
   */
  const answer = await askOverpass(buildOpenGroundQuery(at), { budgetMs: TIMEOUT_MS })
  if (!answer.ok) return { status: 'unavailable', reason: answer.reason }
  const candidates = parseOpenGround(answer.payload)
  cache.set(key, candidates)
  return { status: 'ok', candidates, cached: false }
}

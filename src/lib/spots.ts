/**
 * Saved spots. Venue, subject, window, brief, kit and any positions, under a
 * name.
 *
 * localStorage ONLY. There is no account, no server, and no sync. Export writes
 * a JSON file you own and can put wherever you like; import reads one back. That
 * is the entire backup story, and it is deliberate.
 */

import type { LatLon } from '../core/geo.ts'
import type { KitSelection } from './kitSelection.ts'
import type { CameraPosition } from './plan.ts'
import type { VenueDraft } from './venue.ts'

export const SPOTS_STORAGE_KEY = 'scoutngo.spots.v1'
export const SPOTS_FORMAT = 'scoutngo.spots'
export const SPOTS_VERSION = 1

export interface Spot {
  id: string
  name: string
  /** ISO string, so an exported file is readable and stable. */
  savedAt: string
  venue: VenueDraft
  subject: LatLon | null
  kit: KitSelection
  positions: CameraPosition[]
}

export interface SpotsFile {
  format: string
  version: number
  spots: Spot[]
}

export function newSpotId(): string {
  return `spot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Validates one spot out of untrusted JSON. Anything malformed is dropped rather
 * than allowed to crash a load, because the file may have been hand edited.
 */
export function reviveSpot(raw: unknown): Spot | null {
  if (!isObject(raw)) return null
  const { id, name, savedAt, venue, subject, kit, positions } = raw

  if (typeof id !== 'string' || typeof name !== 'string') return null
  if (!isObject(venue) || !isObject(kit)) return null

  return {
    id,
    name,
    savedAt: typeof savedAt === 'string' ? savedAt : new Date().toISOString(),
    venue: venue as unknown as VenueDraft,
    subject:
      isObject(subject) && typeof subject.lat === 'number' && typeof subject.lon === 'number'
        ? { lat: subject.lat, lon: subject.lon }
        : null,
    kit: kit as unknown as KitSelection,
    positions: Array.isArray(positions) ? (positions as CameraPosition[]) : [],
  }
}

export function reviveSpots(raw: unknown): Spot[] {
  const list = Array.isArray(raw) ? raw : isObject(raw) && Array.isArray(raw.spots) ? raw.spots : []
  return list.map(reviveSpot).filter((spot): spot is Spot => spot !== null)
}

export function toFile(spots: Spot[]): SpotsFile {
  return { format: SPOTS_FORMAT, version: SPOTS_VERSION, spots }
}

export type ImportResult =
  | { ok: true; spots: Spot[]; skipped: number }
  | { ok: false; reason: string }

export function parseSpotsFile(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'That file is not valid JSON.' }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) && Array.isArray(parsed.spots)
      ? parsed.spots
      : null

  if (list === null) {
    return { ok: false, reason: 'That file has no spots in it.' }
  }

  const spots = list.map(reviveSpot).filter((spot): spot is Spot => spot !== null)
  if (spots.length === 0) {
    return { ok: false, reason: 'No readable spots in that file.' }
  }
  return { ok: true, spots, skipped: list.length - spots.length }
}

/** Merges imported spots in, replacing any with the same id. */
export function mergeSpots(existing: Spot[], incoming: Spot[]): Spot[] {
  const byId = new Map(existing.map((spot) => [spot.id, spot]))
  for (const spot of incoming) byId.set(spot.id, spot)
  return [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function exportFilename(now = new Date()): string {
  return `scoutngo-spots-${now.toISOString().slice(0, 10)}.json`
}

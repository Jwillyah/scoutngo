/**
 * Saved spots. Venue, subject, window, brief, kit and any positions, under a
 * name.
 *
 * localStorage ONLY. There is no account, no server, and no sync. Export writes
 * a JSON file you own and can put wherever you like; import reads one back. That
 * is the entire backup story, and it is deliberate.
 */

import type { SiteMark } from '../core/siteMark.ts'
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
  kit: KitSelection
  positions: CameraPosition[]
  /**
   * The hazards and notes marked at this place.
   *
   * OPTIONAL, because every spot saved before this existed has none, and a
   * spot without the field is a spot with no marks rather than a broken one.
   * "The second time I shoot a place the wires are already drawn" is the whole
   * reason these live with the venue rather than with the session.
   */
  marks?: SiteMark[]
  /**
   * The gazetteer's own id for this venue, when it came from a search.
   *
   * WHY THIS IS STORED. "Rodanthe" and "Rodanthe North Carolina" are the same
   * place reached two different ways, and providers return them on slightly
   * different coordinates, so a saved list ends up with two entries for one
   * place. The provider id is the provider SAYING they are one place, which is
   * a stronger claim than two coordinates being near each other.
   *
   * ABSENT FOR A HAND-DROPPED PIN, deliberately. A pin placed by hand is a
   * position, not a gazetteer entry, and two of them twenty metres apart are
   * genuinely two different positions: one on the dock and one on the bank.
   * Merging those would throw away the distinction the shooter made on purpose.
   */
  placeId?: string
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
  const { id, name, savedAt, venue, kit, positions } = raw

  if (typeof id !== 'string' || typeof name !== 'string') return null
  if (!isObject(venue) || !isObject(kit)) return null

  return {
    id,
    name,
    savedAt: typeof savedAt === 'string' ? savedAt : new Date().toISOString(),
    venue: venue as unknown as VenueDraft,
    kit: kit as unknown as KitSelection,
    positions: Array.isArray(positions) ? (positions as CameraPosition[]) : [],
    ...(typeof (raw as Record<string, unknown>).placeId === 'string'
      ? { placeId: (raw as Record<string, unknown>).placeId as string }
      : {}),
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

/**
 * Is this the same place, searched two different ways?
 *
 * Only ever true when BOTH carry the same provider id. Coordinates are
 * deliberately not consulted: two hand-dropped pins near each other are two
 * positions, not one place, and distance cannot tell those cases apart.
 */
export function samePlace(a: Spot, b: Spot): boolean {
  return (
    a.placeId !== undefined &&
    a.placeId !== '' &&
    a.placeId === b.placeId
  )
}

/**
 * Merges imported spots in, replacing any with the same id.
 *
 * ALSO collapses two entries that the gazetteer says are one place, keeping the
 * more recently saved of the two. A spot with no placeId is never collapsed
 * into anything: see the note on Spot.placeId.
 */
export function mergeSpots(existing: Spot[], incoming: Spot[]): Spot[] {
  const byId = new Map(existing.map((spot) => [spot.id, spot]))
  for (const spot of incoming) byId.set(spot.id, spot)

  const kept: Spot[] = []
  for (const spot of [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt))) {
    if (kept.some((other) => samePlace(spot, other))) continue
    kept.push(spot)
  }
  return kept
}

export function exportFilename(now = new Date()): string {
  return `scoutngo-spots-${now.toISOString().slice(0, 10)}.json`
}

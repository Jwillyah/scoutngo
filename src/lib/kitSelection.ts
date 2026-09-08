import type { KitProfile } from '../core/kit.ts'

/**
 * Which of the kit is actually in play for this shoot, plus the free text
 * shooting style. Stored in localStorage on this device. Never sent anywhere.
 */
export interface KitSelection {
  bodyIds: string[]
  lensIds: string[]
  droneIds: string[]
  styleNotes: string
}

export const KIT_STORAGE_KEY = 'scoutngo.kit.v1'

export function defaultSelection(kit: KitProfile): KitSelection {
  return {
    bodyIds: kit.bodies.map((b) => b.id),
    lensIds: kit.lenses.map((l) => l.id),
    droneIds: kit.drones.map((d) => d.id),
    styleNotes: kit.style.notes.join('\n'),
  }
}

function idsFrom(raw: unknown, allowed: string[]): string[] | null {
  if (!Array.isArray(raw)) return null
  // Drop anything that is not a known id, so a renamed lens cannot resurrect.
  return raw.filter((id): id is string => typeof id === 'string' && allowed.includes(id))
}

/** Merges whatever is in storage with the current kit. Tolerates any shape. */
export function reviveSelection(raw: unknown, kit: KitProfile): KitSelection {
  const fallback = defaultSelection(kit)
  if (typeof raw !== 'object' || raw === null) return fallback

  const stored = raw as Partial<Record<keyof KitSelection, unknown>>
  return {
    bodyIds: idsFrom(stored.bodyIds, fallback.bodyIds) ?? fallback.bodyIds,
    lensIds: idsFrom(stored.lensIds, fallback.lensIds) ?? fallback.lensIds,
    droneIds: idsFrom(stored.droneIds, fallback.droneIds) ?? fallback.droneIds,
    styleNotes:
      typeof stored.styleNotes === 'string' ? stored.styleNotes : fallback.styleNotes,
  }
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
}

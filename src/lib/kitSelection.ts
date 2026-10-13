import { DEFAULT_KIT, type KitProfile } from '../core/kit.ts'

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

/**
 * Brings a stored kit profile back, tolerating any shape.
 *
 * ANYTHING MALFORMED FALLS BACK TO THE SHIPPED PROFILE rather than being
 * patched up. A half-revived lens with a missing focal length would compute a
 * field of view from undefined and put a confident number on a card, which is
 * worse than starting from the default and being told to add it again.
 */
export function reviveKitProfile(raw: unknown): KitProfile {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_KIT
  const stored = raw as Partial<KitProfile>

  const lenses = Array.isArray(stored.lenses)
    ? stored.lenses.filter(
        (l): l is KitProfile['lenses'][number] =>
          typeof l?.id === 'string' &&
          typeof l?.name === 'string' &&
          Number.isFinite(l?.minFocalLength) &&
          Number.isFinite(l?.maxFocalLength) &&
          Array.isArray(l?.forcesSensor),
      )
    : null
  const bodies = Array.isArray(stored.bodies)
    ? stored.bodies.filter(
        (b): b is KitProfile['bodies'][number] =>
          typeof b?.id === 'string' && typeof b?.name === 'string' &&
          (b?.sensor === 'fullFrame' || b?.sensor === 'apsc'),
      )
    : null
  const drones = Array.isArray(stored.drones)
    ? stored.drones.filter(
        (d): d is KitProfile['drones'][number] =>
          typeof d?.id === 'string' && typeof d?.name === 'string' &&
          Number.isFinite(d?.weightGrams) && Array.isArray(d?.cameras),
      )
    : null

  if (lenses === null || bodies === null || drones === null) return DEFAULT_KIT

  return {
    id: typeof stored.id === 'string' ? stored.id : DEFAULT_KIT.id,
    name: typeof stored.name === 'string' ? stored.name : DEFAULT_KIT.name,
    bodies,
    lenses,
    drones,
    style: DEFAULT_KIT.style,
  }
}

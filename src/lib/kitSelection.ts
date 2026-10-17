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

/**
 * Where the editable kit profile lives.
 *
 * NAMED HERE rather than written at the useState call, because the kit screen
 * reads the raw JSON back to report what survived reviving, and two copies of
 * a storage key is how one of them ends up reading nothing and reporting all
 * clear. See src/lib/kitAudit.ts.
 */
export const KIT_PROFILE_STORAGE_KEY = 'scoutngo.kitProfile.v1'

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
 * WHAT A STORED ENTRY HAS TO HAVE TO BE USABLE.
 *
 * EXPORTED, AND THE ONLY COPY. The kit screen reports which stored entries
 * failed to come back, and it has to ask the same question the reviver asked.
 * Two copies of "is this readable" is how the reviver drops a lens while the
 * report says everything arrived, which is the exact drift this week has been
 * spent closing. One predicate, two callers.
 *
 * STRICT ON PURPOSE. A half-revived lens with a missing focal length would
 * compute a field of view from undefined and put a confident number on a card,
 * so anything that fails is DROPPED rather than patched up. Re-typing one lens
 * costs nothing; a broken entry downstream is new surface for every bug this
 * validation exists to prevent.
 */
export const isStoredBody = (b: unknown): b is KitProfile['bodies'][number] => {
  const body = b as Partial<KitProfile['bodies'][number]> | null
  return (
    typeof body?.id === 'string' &&
    typeof body?.name === 'string' &&
    (body?.sensor === 'fullFrame' || body?.sensor === 'apsc')
  )
}

export const isStoredLens = (l: unknown): l is KitProfile['lenses'][number] => {
  const lens = l as Partial<KitProfile['lenses'][number]> | null
  return (
    typeof lens?.id === 'string' &&
    typeof lens?.name === 'string' &&
    Number.isFinite(lens?.minFocalLength) &&
    Number.isFinite(lens?.maxFocalLength) &&
    Array.isArray(lens?.forcesSensor)
  )
}

export const isStoredDrone = (d: unknown): d is KitProfile['drones'][number] => {
  const drone = d as Partial<KitProfile['drones'][number]> | null
  return (
    typeof drone?.id === 'string' &&
    typeof drone?.name === 'string' &&
    Number.isFinite(drone?.weightGrams) &&
    Array.isArray(drone?.cameras)
  )
}

/**
 * Brings a stored kit profile back, tolerating any shape.
 *
 * ANYTHING MALFORMED IS DROPPED rather than patched up, and the kit screen
 * says which one went and what could be read of it. See src/lib/kitAudit.ts:
 * dropping silently was the bug; dropping is not.
 */
export function reviveKitProfile(raw: unknown): KitProfile {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_KIT
  const stored = raw as Partial<KitProfile>

  const lenses = Array.isArray(stored.lenses) ? stored.lenses.filter(isStoredLens) : null
  const bodies = Array.isArray(stored.bodies) ? stored.bodies.filter(isStoredBody) : null
  const drones = Array.isArray(stored.drones) ? stored.drones.filter(isStoredDrone) : null

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

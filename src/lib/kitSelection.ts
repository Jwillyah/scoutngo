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

/*
 * SHELVED: MINE, BUT STOP OFFERING IT.
 *
 * Three states, not two:
 *
 *   IN THE BAG  ticked for this shoot       in the selection's ids
 *   OWNED       mine, not in the bag today  in the profile, not in the ids
 *   SHELVED     mine, but stop offering it  in the profile and in this list
 *
 * WHY ITS OWN LIST AND NOT A FIELD ON THE SELECTION. Shelving is a fact about
 * owning the gear, not about one shoot. A saved spot carries its own
 * selection, and if shelving lived there, loading last summer's spot would
 * quietly take the 75-300 back off the shelf. One list, on this device, and
 * every selection is passed through it on the way in.
 *
 * NEVER IN THE BAG. Every write of a selection -- revive, a spot loading, a
 * toggle, reset -- strips shelved ids, so nothing downstream of the bag (the
 * position card's picker, the model's optics, the default optic for a new
 * position) can ever see shelved gear. Only the kit editor lists it, which is
 * where you go looking.
 */
export const SHELVED_STORAGE_KEY = 'scoutngo.shelved.v1'

export type GearState = 'bag' | 'owned' | 'shelved'

const allIds = (kit: KitProfile): string[] => [
  ...kit.bodies.map((b) => b.id),
  ...kit.lenses.map((l) => l.id),
  ...kit.drones.map((d) => d.id),
]

/** Only ids this kit actually has, so a deleted lens cannot stay shelved forever. */
export function reviveShelved(raw: unknown, kit: KitProfile): string[] {
  if (!Array.isArray(raw)) return []
  const known = allIds(kit)
  return raw.filter((id): id is string => typeof id === 'string' && known.includes(id))
}

/** The selection with nothing shelved in the bag. */
export function withoutShelved(selection: KitSelection, shelved: readonly string[]): KitSelection {
  if (shelved.length === 0) return selection
  const keep = (ids: string[]) => ids.filter((id) => !shelved.includes(id))
  return {
    ...selection,
    bodyIds: keep(selection.bodyIds),
    lensIds: keep(selection.lensIds),
    droneIds: keep(selection.droneIds),
  }
}

/** The profile as the PICKERS see it: shelved gear left out. Never used for resolving optics. */
export function pickableKit(kit: KitProfile, shelved: readonly string[]): KitProfile {
  if (shelved.length === 0) return kit
  return {
    ...kit,
    bodies: kit.bodies.filter((b) => !shelved.includes(b.id)),
    lenses: kit.lenses.filter((l) => !shelved.includes(l.id)),
    drones: kit.drones.filter((d) => !shelved.includes(d.id)),
  }
}

export function gearState(
  id: string,
  selection: KitSelection,
  shelved: readonly string[],
): GearState {
  if (shelved.includes(id)) return 'shelved'
  return [...selection.bodyIds, ...selection.lensIds, ...selection.droneIds].includes(id)
    ? 'bag'
    : 'owned'
}

/** Shelve or unshelve. Unshelving returns gear to OWNED, not to the bag. */
export function setShelved(shelved: readonly string[], id: string, on: boolean): string[] {
  const without = shelved.filter((existing) => existing !== id)
  return on ? [...without, id] : without
}

/** Everything owned and not shelved, in the bag. What "reset" and a first run start from. */
export function defaultSelection(kit: KitProfile, shelved: readonly string[] = []): KitSelection {
  return withoutShelved(
    {
      bodyIds: kit.bodies.map((b) => b.id),
      lensIds: kit.lenses.map((l) => l.id),
      droneIds: kit.drones.map((d) => d.id),
      styleNotes: kit.style.notes.join('\n'),
    },
    shelved,
  )
}

function idsFrom(raw: unknown, allowed: string[]): string[] | null {
  if (!Array.isArray(raw)) return null
  // Drop anything that is not a known id, so a renamed lens cannot resurrect.
  return raw.filter((id): id is string => typeof id === 'string' && allowed.includes(id))
}

/** Merges whatever is in storage with the current kit. Tolerates any shape. */
export function reviveSelection(
  raw: unknown,
  kit: KitProfile,
  shelved: readonly string[] = [],
): KitSelection {
  const fallback = defaultSelection(kit, shelved)
  if (typeof raw !== 'object' || raw === null) return fallback

  /* Known ids are checked against the whole kit; shelved ones are then taken out. */
  const known = defaultSelection(kit)
  const stored = raw as Partial<Record<keyof KitSelection, unknown>>
  return withoutShelved(
    {
      bodyIds: idsFrom(stored.bodyIds, known.bodyIds) ?? fallback.bodyIds,
      lensIds: idsFrom(stored.lensIds, known.lensIds) ?? fallback.lensIds,
      droneIds: idsFrom(stored.droneIds, known.droneIds) ?? fallback.droneIds,
      styleNotes:
        typeof stored.styleNotes === 'string' ? stored.styleNotes : fallback.styleNotes,
    },
    shelved,
  )
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

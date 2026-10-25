/*
 * CHANGES TO THE SHOOTER'S OWN KIT, ASKED FOR BY NAME, APPLIED ONCE.
 *
 * WHY THIS IS NOT AN EDIT TO DEFAULT_KIT. The kit that matters lives on the
 * phone, in localStorage, and DEFAULT_KIT is only what a first run starts
 * from; changing it would change nothing on a phone that already has a kit.
 * (src/core was also frozen for the offline brief.) So a requested change is
 * written here as an amendment, applied to the stored profile on load, and
 * recorded as applied so it never runs twice: removing the lens afterwards,
 * or taking the 75-300 back off the shelf, sticks.
 *
 * NOTHING IS INVENTED. Only what was asked for. The 70-200 first went in with
 * no aperture, because "a Sony 70-200" is an f/4 or an f/2.8 and nobody had
 * said which; it is the f/2.8 GM II, said on 26 October.
 */
import type { KitProfile, Lens } from '../core/kit.ts'

export const AMENDMENTS_STORAGE_KEY = 'scoutngo.kitAmendments.v1'

export interface KitAmendment {
  id: string
  /** What it did, said on the kit screen the once it is applied. */
  says: string
  addLenses: Lens[]
  shelve: string[]
  /** Fields to set on a lens the kit already has. A lens it does not have is left alone. */
  updateLenses?: { id: string; set: Partial<Pick<Lens, 'name' | 'maxAperture'>> }[]
}

/*
 * THE LENS AS NAMED ON 25 OCTOBER, IN FULL: the Sony FE 70-200mm f/2.8 GM II.
 * The first amendment shipped it with no aperture because nobody had said
 * which 70-200 it was; a phone that already applied that one is corrected by
 * the second, a fresh one gets it right first time.
 */
const SONY_70_200_NAME = 'Sony 70-200 f2.8 GM II'
const SONY_70_200_APERTURE = 2.8

export const AMENDMENTS: readonly KitAmendment[] = [
  {
    id: '2026-10-25-sony-70-200',
    says: 'Added the Sony 70-200 and shelved the Sony 75-300, as asked on 25 October.',
    addLenses: [
      {
        id: 'sony-70-200',
        name: SONY_70_200_NAME,
        minFocalLength: 70,
        maxFocalLength: 200,
        maxAperture: SONY_70_200_APERTURE,
        forcesSensor: [],
        notes: '',
      },
    ],
    shelve: ['sony-75-300'],
  },
  {
    id: '2026-10-26-sony-70-200-f2.8',
    says: 'The 70-200 is the f/2.8 GM II, as you said on 26 October.',
    addLenses: [],
    shelve: [],
    updateLenses: [
      { id: 'sony-70-200', set: { name: SONY_70_200_NAME, maxAperture: SONY_70_200_APERTURE } },
    ],
  },
]

export interface Amended {
  profile: KitProfile
  shelved: string[]
  applied: string[]
  /** What was applied this time, for one line on the kit screen. Empty when nothing ran. */
  said: string[]
}

/**
 * Applies every amendment not yet applied. Pure: the caller stores the result.
 *
 * A lens already present is not added twice, and shelving only touches gear
 * the kit actually has, so a kit that already looks right is left alone apart
 * from being marked done.
 */
export function applyAmendments(
  profile: KitProfile,
  shelved: readonly string[],
  applied: readonly string[],
  amendments: readonly KitAmendment[] = AMENDMENTS,
): Amended {
  let nextProfile = profile
  let nextShelved = [...shelved]
  const nextApplied = [...applied]
  const said: string[] = []

  for (const amendment of amendments) {
    if (nextApplied.includes(amendment.id)) continue
    const before = JSON.stringify([nextProfile, nextShelved])
    const missing = amendment.addLenses.filter(
      (lens) => !nextProfile.lenses.some((existing) => existing.id === lens.id),
    )
    if (missing.length > 0) {
      nextProfile = { ...nextProfile, lenses: [...nextProfile.lenses, ...missing] }
    }
    for (const update of amendment.updateLenses ?? []) {
      nextProfile = {
        ...nextProfile,
        lenses: nextProfile.lenses.map((lens) =>
          lens.id === update.id ? { ...lens, ...update.set } : lens,
        ),
      }
    }
    for (const id of amendment.shelve) {
      const owned = [...nextProfile.lenses, ...nextProfile.bodies, ...nextProfile.drones].some(
        (gear) => gear.id === id,
      )
      if (owned && !nextShelved.includes(id)) nextShelved = [...nextShelved, id]
    }
    nextApplied.push(amendment.id)
    /* Said only when it changed something: a fresh kit already has the corrected lens. */
    if (JSON.stringify([nextProfile, nextShelved]) !== before) said.push(amendment.says)
  }

  return { profile: nextProfile, shelved: nextShelved, applied: nextApplied, said }
}

export function readApplied(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(AMENDMENTS_STORAGE_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function writeApplied(applied: readonly string[]): void {
  try {
    localStorage.setItem(AMENDMENTS_STORAGE_KEY, JSON.stringify(applied))
  } catch {
    /* Storage refused: it will apply again next load, which is idempotent. */
  }
}

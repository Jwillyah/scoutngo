import type { KitProfile } from './kit.ts'
import type { PlatformFilter } from './platformFilter.ts'

/**
 * WHAT THE PLATFORM CHIP PACKS.
 *
 * WHAT WAS REPORTED. "Drone selected, and the kit row has a7IV, a7III, 28-75
 * and 200-600 all ticked." The chip said what was flying and the bag still
 * held everything, so the packing list was never a packing list.
 *
 * THE RULE, in the shooter's words: "Drone packs the aircraft and unticks the
 * bodies and glass. Ground does the reverse. Both leaves it alone. If I then
 * tick something by hand, that is mine and the chip does not undo it."
 *
 * BOTH LEAVES IT ALONE, and that is not laziness: Both is the state that has
 * not committed to anything, so there is no packing it implies. A chip that
 * repacked on Both would be making a decision nobody asked for, which is the
 * mistake the Daytime chip made when it reset the platform filter.
 *
 * HOLDS ARE PER ITEM, not a flag that switches the chips off.
 *
 * The obvious cheaper design is a single "the shooter has touched the kit"
 * boolean, after which chips stop repacking. It is wrong here, and the reason
 * is in the sentence: "if I then tick something BY HAND, THAT is mine". The
 * subject is one item. Somebody who tacks the a7IV onto a drone shoot for
 * stills has said something about the a7IV, not about whether the chips are
 * still welcome to pack the rest. A boolean would hear it as the second.
 *
 * So a hand toggle is remembered as a hold on that id, and a hold outranks the
 * chip for ever after, in whichever direction it was made.
 */
export interface KitHolds {
  /** Ids the shooter ticked by hand. The chip may not untick these. */
  on: readonly string[]
  /** Ids the shooter unticked by hand. The chip may not tick these. */
  off: readonly string[]
}

export const NO_HOLDS: KitHolds = { on: [], off: [] }

export interface PackedIds {
  bodyIds: string[]
  lensIds: string[]
  droneIds: string[]
}

/**
 * Records a hand toggle.
 *
 * A hold REPLACES the opposite hold rather than sitting beside it: unticking
 * something previously held on is the shooter changing their mind, and keeping
 * both would make the result depend on which list was read first.
 */
export function holdToggle(holds: KitHolds, id: string, nowOn: boolean): KitHolds {
  return {
    on: nowOn ? [...holds.on.filter((x) => x !== id), id] : holds.on.filter((x) => x !== id),
    off: nowOn ? holds.off.filter((x) => x !== id) : [...holds.off.filter((x) => x !== id), id],
  }
}

/** Everything the profile has of each kind. What a chip packs from. */
const allIds = (profile: KitProfile): PackedIds => ({
  bodyIds: profile.bodies.map((b) => b.id),
  lensIds: profile.lenses.map((l) => l.id),
  droneIds: profile.drones.map((d) => d.id),
})

/**
 * What the chip would pack, before holds.
 *
 * Null for 'both', which is how "leaves it alone" is said in a type rather
 * than in a comment: there is no packing to apply, so there is nothing to
 * return and nothing downstream can accidentally use one.
 */
function chipPacking(filter: PlatformFilter, profile: KitProfile): PackedIds | null {
  const all = allIds(profile)
  if (filter === 'air') return { bodyIds: [], lensIds: [], droneIds: all.droneIds }
  if (filter === 'ground') return { bodyIds: all.bodyIds, lensIds: all.lensIds, droneIds: [] }
  return null
}

/**
 * The selection after a chip, with the shooter's own choices preserved.
 *
 * Returns `current` unchanged on Both, and on any filter where the chip's
 * packing would make no difference, so a caller can compare by identity and
 * skip a pointless state write.
 */
export function packForPlatform(
  filter: PlatformFilter,
  profile: KitProfile,
  current: PackedIds,
  holds: KitHolds = NO_HOLDS,
): PackedIds {
  const packing = chipPacking(filter, profile)
  if (packing === null) return current

  const all = allIds(profile)
  const apply = (packed: string[], every: string[]): string[] =>
    every.filter((id) => {
      if (holds.off.includes(id)) return false
      if (holds.on.includes(id)) return true
      return packed.includes(id)
    })

  const next: PackedIds = {
    bodyIds: apply(packing.bodyIds, all.bodyIds),
    lensIds: apply(packing.lensIds, all.lensIds),
    droneIds: apply(packing.droneIds, all.droneIds),
  }

  const same =
    next.bodyIds.join() === current.bodyIds.join() &&
    next.lensIds.join() === current.lensIds.join() &&
    next.droneIds.join() === current.droneIds.join()

  return same ? current : next
}

/** What to say about a chip that packed, so the change is never silent. */
export function packingLine(filter: PlatformFilter, packed: PackedIds, holds: KitHolds): string | null {
  if (filter === 'both') return null
  const kept = holds.on.length
  const base =
    filter === 'air'
      ? `Packed the aircraft and left the bodies and glass behind.`
      : `Packed the bodies and glass and left the aircraft behind.`
  const total = packed.bodyIds.length + packed.lensIds.length + packed.droneIds.length
  const held = kept === 0 ? '' : ` ${kept} you ticked by hand ${kept === 1 ? 'stays' : 'stay'}.`
  return `${base} ${total} ${total === 1 ? 'item' : 'items'} packed.${held}`
}


/**
 * WHETHER THE DRONE CHIP CAN BE OFFERED AT ALL.
 *
 * ASKED OF THE PROFILE, NOT OF THE SELECTION, and the difference is a trap
 * this walked straight into.
 *
 * The chip's whole job is to change the selection. If its availability is read
 * from the selection, then packing Ground unticks the aircraft, which makes
 * the Drone chip unavailable, which means there is no way back: measured in
 * the browser as Drone working once, Ground working, and Drone then doing
 * nothing at all.
 *
 * A control may not derive its own enabled state from the thing it exists to
 * change. What it can ask is whether the shooter OWNS an aircraft, which is a
 * fact about the kit profile and is not something any chip can alter.
 *
 * NOT THE SAME QUESTION as droneAvailable in src/lib/planRequest.ts, which
 * asks whether an air position can be MADE right now and is correctly about
 * the selection: with no aircraft packed, the Air tab on the map would be a
 * tab that can only ever be empty.
 */
export function canPackAir(profile: KitProfile): boolean {
  return profile.drones.some((drone) => drone.cameras.length > 0)
}

import type { KitProfile } from './kit.ts'
import type { PlatformFilter } from './platformFilter.ts'

/**
 * WHAT ORDER THE KIT ROW IS IN.
 *
 * WHAT WAS REPORTED. "With Drone selected, Air 3S is last and off the right
 * edge. Whatever the chip packed goes first, so I can see what is coming with
 * me without scrolling."
 *
 * The row was in profile order: bodies, lenses, drones, always. That is the
 * order the kit was WRITTEN in, which is a fact about the file and not about
 * the shoot. On a drone shoot the one thing coming is the last thing shown.
 *
 * SO THE PLATFORM DECIDES THE ORDER, and the rule is the same one the packing
 * uses: whatever the chip packed leads. Both ends of this are the same idea,
 * so a drone shoot shows the aircraft first and a ground shoot shows the
 * bodies first, and Both leaves the row in profile order because Both has not
 * committed to anything.
 *
 * NOTHING IS HIDDEN. The unpacked gear is still there, still tappable, still
 * in its own order behind the packed gear: the shooter who wants the a7IV on a
 * drone shoot has to be able to reach it, and that is the whole point of the
 * holds in src/core/kitPacking.ts.
 */
export type KitRowKind = 'body' | 'lens' | 'drone'

export interface KitRowEntry {
  kind: KitRowKind
  id: string
  name: string
}

const entries = (profile: KitProfile): KitRowEntry[] => [
  ...profile.bodies.map((b) => ({ kind: 'body' as const, id: b.id, name: b.name })),
  ...profile.lenses.map((l) => ({ kind: 'lens' as const, id: l.id, name: l.name })),
  ...profile.drones.map((d) => ({ kind: 'drone' as const, id: d.id, name: d.name })),
]

/** Which kinds the chip packs for this platform, in the order they lead. */
function leading(filter: PlatformFilter): KitRowKind[] {
  if (filter === 'air') return ['drone']
  if (filter === 'ground') return ['body', 'lens']
  return []
}

export function kitRowOrder(filter: PlatformFilter, profile: KitProfile): KitRowEntry[] {
  const first = leading(filter)
  if (first.length === 0) return entries(profile)

  const all = entries(profile)
  return [
    ...all.filter((entry) => first.includes(entry.kind)),
    ...all.filter((entry) => !first.includes(entry.kind)),
  ]
}

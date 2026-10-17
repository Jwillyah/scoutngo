import { DEFAULT_KIT, type KitProfile } from '../core/kit.ts'
import type { KitSelection } from './kitSelection.ts'

/**
 * WHAT IS ACTUALLY IN THE STORED KIT, AGAINST THE SHIPPED ONE.
 *
 * WHY THIS EXISTS. A stored SELECTION was being revived against DEFAULT_KIT
 * rather than against the shooter's own profile, so any id the shipped kit had
 * never heard of was filtered out on every reload. "Tell me what the current
 * stored kit actually contains versus the shipped list, so I know whether I
 * lost anything."
 *
 * I cannot read the phone, so the app answers it on the device.
 *
 * WHAT THAT BUG COULD AND COULD NOT LOSE, precisely, because the two are
 * different and the difference is the whole answer:
 *
 *   THE GEAR ITSELF WAS NEVER DELETED. reviveKitProfile reads the stored
 *   profile and keeps what is in it. A body, lens or aircraft added by hand
 *   stayed in the kit editor throughout.
 *
 *   ITS SELECTION WAS. reviveSelection filtered the packed-for-this-shoot
 *   ids against DEFAULT_KIT, so added gear came back UNTICKED every reload.
 *   That is what made the Drone chip offer a flight it could not supply.
 *
 *   AND THAT COULD PROPAGATE. A spot saved while the selection was stripped
 *   recorded the stripped selection, so the loss outlived the session.
 *
 * SEPARATELY, AND STILL TRUE: reviveKitProfile drops individual entries that
 * fail validation, and falls back to the shipped kit wholesale if the stored
 * lenses, bodies or drones are not arrays. Those are real losses rather than
 * un-tickings, and nothing said so. This reports them too.
 */

export type GearKind = 'body' | 'lens' | 'drone'

export interface GearRef {
  kind: GearKind
  id: string
  name: string
}

export interface KitAudit {
  /** In the stored profile and not in the shipped kit: gear added by hand. */
  added: GearRef[]
  /** In the shipped kit and not in the stored profile: gear removed by hand. */
  removed: GearRef[]
  /**
   * Entries that were in storage and could not be read back.
   *
   * A REAL LOSS, not a tick. Reported loudly because nothing else would say
   * so: the entry is simply absent afterwards.
   */
  unreadable: { kind: GearKind; index: number }[]
  /** True when the whole stored profile was unusable and the shipped one is in use. */
  profileReplaced: boolean
  /**
   * Selected ids that resolve against nothing in the profile.
   *
   * The signature of the stripping bug, seen from the other side: a selection
   * that names gear the kit does not have.
   */
  dangling: { kind: GearKind; id: string }[]
}

const refs = (profile: KitProfile): GearRef[] => [
  ...profile.bodies.map((b) => ({ kind: 'body' as const, id: b.id, name: b.name })),
  ...profile.lenses.map((l) => ({ kind: 'lens' as const, id: l.id, name: l.name })),
  ...profile.drones.map((d) => ({ kind: 'drone' as const, id: d.id, name: d.name })),
]

/** How many entries of each kind storage held, before anything was dropped. */
function storedCount(raw: unknown, key: 'bodies' | 'lenses' | 'drones'): number | null {
  if (typeof raw !== 'object' || raw === null) return null
  const list = (raw as Record<string, unknown>)[key]
  return Array.isArray(list) ? list.length : null
}

export function auditKit(
  /** The raw JSON that was in localStorage, before reviving. */
  rawProfile: unknown,
  /** The profile that came back out of it. */
  profile: KitProfile,
  /** The selection in use. */
  selection: KitSelection,
  shipped: KitProfile = DEFAULT_KIT,
): KitAudit {
  const mine = refs(profile)
  const theirs = refs(shipped)
  const sameRef = (a: GearRef, b: GearRef) => a.kind === b.kind && a.id === b.id

  const added = mine.filter((ref) => !theirs.some((other) => sameRef(ref, other)))
  const removed = theirs.filter((ref) => !mine.some((other) => sameRef(ref, other)))

  /*
   * ENTRIES THAT WENT MISSING BETWEEN STORAGE AND HERE. Counted rather than
   * named, because an entry that failed to revive has no trustworthy name to
   * print. The count is what matters: it says something was there and is not.
   */
  const unreadable: KitAudit['unreadable'] = []
  const pairs: [GearKind, 'bodies' | 'lenses' | 'drones', number][] = [
    ['body', 'bodies', profile.bodies.length],
    ['lens', 'lenses', profile.lenses.length],
    ['drone', 'drones', profile.drones.length],
  ]
  for (const [kind, key, kept] of pairs) {
    const was = storedCount(rawProfile, key)
    if (was !== null && was > kept) {
      for (let i = 0; i < was - kept; i++) unreadable.push({ kind, index: i })
    }
  }

  /*
   * THE WHOLE PROFILE FELL BACK. reviveKitProfile returns the shipped kit if
   * the stored lenses, bodies or drones are not arrays, which silently
   * replaces everything. Detected by storage having had a profile at all
   * while nothing of it survived as added or removed gear.
   */
  const hadProfile = typeof rawProfile === 'object' && rawProfile !== null
  const profileReplaced =
    hadProfile &&
    (['bodies', 'lenses', 'drones'] as const).some((key) => storedCount(rawProfile, key) === null)

  const dangling: KitAudit['dangling'] = [
    ...selection.bodyIds
      .filter((id) => !profile.bodies.some((b) => b.id === id))
      .map((id) => ({ kind: 'body' as const, id })),
    ...selection.lensIds
      .filter((id) => !profile.lenses.some((l) => l.id === id))
      .map((id) => ({ kind: 'lens' as const, id })),
    ...selection.droneIds
      .filter((id) => !profile.drones.some((d) => d.id === id))
      .map((id) => ({ kind: 'drone' as const, id })),
  ]

  return { added, removed, unreadable, profileReplaced, dangling }
}

/** Whether there is anything at all worth telling the shooter. */
export function kitAuditHasNews(audit: KitAudit): boolean {
  return (
    audit.added.length > 0 ||
    audit.removed.length > 0 ||
    audit.unreadable.length > 0 ||
    audit.profileReplaced ||
    audit.dangling.length > 0
  )
}

/* Singular and plural, because "1 stored lenses" reads like a second bug. */
const KIND_WORD: Record<GearKind, { one: string; many: string }> = {
  body: { one: 'body', many: 'bodies' },
  lens: { one: 'lens', many: 'lenses' },
  drone: { one: 'aircraft', many: 'aircraft' },
}

/**
 * The lines to show. Each one states a fact about storage; none of them says
 * everything is fine, because "nothing to report" is the absence of lines.
 */
export function kitAuditLines(audit: KitAudit): { tone: 'loss' | 'fact'; text: string }[] {
  const lines: { tone: 'loss' | 'fact'; text: string }[] = []

  if (audit.profileReplaced) {
    lines.push({
      tone: 'loss',
      text: 'The stored kit could not be read and the shipped one is in use. Anything you had added is not in this list.',
    })
  }

  for (const kind of ['body', 'lens', 'drone'] as const) {
    const lost = audit.unreadable.filter((entry) => entry.kind === kind).length
    if (lost > 0) {
      const word = lost === 1 ? KIND_WORD[kind].one : KIND_WORD[kind].many
      lines.push({
        tone: 'loss',
        text: `${lost} stored ${word} could not be read back and ${
          lost === 1 ? 'is' : 'are'
        } no longer here. Whatever ${lost === 1 ? 'it was, it is' : 'they were, they are'} not in this list.`,
      })
    }
  }

  if (audit.dangling.length > 0) {
    lines.push({
      tone: 'loss',
      text: `${audit.dangling.length} packed ${audit.dangling.length === 1 ? 'item' : 'items'} point at gear this kit does not have: ${audit.dangling
        .map((entry) => entry.id)
        .join(', ')}.`,
    })
  }

  if (audit.added.length > 0) {
    lines.push({
      tone: 'fact',
      text: `Yours, not in the shipped list: ${audit.added.map((ref) => ref.name).join(', ')}.`,
    })
  }

  if (audit.removed.length > 0) {
    lines.push({
      tone: 'fact',
      text: `In the shipped list and not in yours: ${audit.removed.map((ref) => ref.name).join(', ')}.`,
    })
  }

  return lines
}

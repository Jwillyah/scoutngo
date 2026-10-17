import { DEFAULT_KIT, type KitProfile } from '../core/kit.ts'
import {
  isStoredBody,
  isStoredDrone,
  isStoredLens,
  type KitSelection,
} from './kitSelection.ts'

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
   *
   * EACH ONE CARRIES WHATEVER WAS LEGIBLE IN IT. "1 stored lens could not be
   * read back" does not say which one to re-add. "It looked like: Sigma 30,
   * 30mm" does, and that is the whole value of the line. The fragment is built
   * ONLY from fields that actually held a usable value; when nothing did, it
   * is null and the line says so rather than inventing a description.
   */
  unreadable: DroppedEntry[]
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

export interface DroppedEntry {
  kind: GearKind
  /**
   * Whatever was legible in it, or null when nothing was.
   *
   * Never a guess. If the entry held a name, the name is here; if it held a
   * focal length, that is here; if it held neither, this is null and the
   * line says nothing was readable rather than describing a thing it cannot
   * describe.
   */
  fragment: string | null
}

const refs = (profile: KitProfile): GearRef[] => [
  ...profile.bodies.map((b) => ({ kind: 'body' as const, id: b.id, name: b.name })),
  ...profile.lenses.map((l) => ({ kind: 'lens' as const, id: l.id, name: l.name })),
  ...profile.drones.map((d) => ({ kind: 'drone' as const, id: d.id, name: d.name })),
]

/** The stored list for one kind, or null when storage did not hold a list. */
function storedList(raw: unknown, key: 'bodies' | 'lenses' | 'drones'): unknown[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const list = (raw as Record<string, unknown>)[key]
  return Array.isArray(list) ? list : null
}

/**
 * One readable string out of an unvalidated value.
 *
 * THIS IS CORRUPT DATA BEING PUT ON A SCREEN, so it is trimmed, length-capped
 * and stripped of control characters. React escapes the markup; this is about
 * a 40,000 character "name" pushing the rest of the kit screen off the phone.
 */
function readableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  /*
   * Filtered by CODE POINT rather than by a character class. A class needs
   * literal control characters or escape sequences in the source, and the
   * first version of this line ended up with real control bytes written into
   * the file: unreadable, and quietly wrong if one were ever normalised away.
   */
  const clean = [...value]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : ch
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean === '') return null
  return clean.length > MAX_FRAGMENT_CHARS ? `${clean.slice(0, MAX_FRAGMENT_CHARS)}...` : clean
}

/** Long enough to recognise a lens by, short enough not to take the screen. */
const MAX_FRAGMENT_CHARS = 40

/** A finite number, or null. Zero is a real value and survives. */
function readableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * What could be read of an entry that failed to revive.
 *
 * Each kind is asked for the fields a person would recognise it by, in the
 * order they would say them. Nothing is inferred from anything else: a lens
 * with a min focal length and no max reports the min alone rather than
 * assuming a prime.
 */
export function describeDropped(kind: GearKind, raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const entry = raw as Record<string, unknown>
  const parts: string[] = []

  const name = readableText(entry.name)
  if (name !== null) parts.push(name)

  if (kind === 'lens') {
    const min = readableNumber(entry.minFocalLength)
    const max = readableNumber(entry.maxFocalLength)
    if (min !== null && max !== null) parts.push(min === max ? `${min}mm` : `${min}-${max}mm`)
    else if (min !== null) parts.push(`${min}mm and no longer end`)
    else if (max !== null) parts.push(`up to ${max}mm`)

    const aperture = readableNumber(entry.maxAperture)
    if (aperture !== null) parts.push(`f${aperture}`)
  }

  if (kind === 'body') {
    const sensor = entry.sensor
    if (sensor === 'fullFrame') parts.push('full frame')
    else if (sensor === 'apsc') parts.push('APS-C')
    const role = readableText(entry.role)
    if (role !== null) parts.push(role)
  }

  if (kind === 'drone') {
    const grams = readableNumber(entry.weightGrams)
    if (grams !== null) parts.push(`${grams}g`)
    if (Array.isArray(entry.cameras)) {
      parts.push(entry.cameras.length === 1 ? '1 camera' : `${entry.cameras.length} cameras`)
    }
  }

  /*
   * THE ID LAST, and only when nothing else was legible. It is the least
   * human of the fields and is usually the one thing a corrupt entry still
   * has, so leading with it would bury a real name behind "sigma-30".
   */
  if (parts.length === 0) {
    const id = readableText(entry.id)
    if (id !== null) parts.push(`id ${id}`)
  }

  return parts.length === 0 ? null : parts.join(', ')
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
   * ENTRIES THAT WENT MISSING BETWEEN STORAGE AND HERE, each with whatever
   * was legible in it.
   *
   * FOUND WITH THE REVIVER'S OWN PREDICATE rather than by subtracting counts.
   * Counting says how many went; asking the same question the reviver asked
   * says WHICH, and which is the only version of this line worth reading:
   * "1 stored lens could not be read back" does not tell anyone what to
   * re-add. It also means the two can never disagree about what readable is.
   */
  const unreadable: DroppedEntry[] = []
  const kinds: [GearKind, 'bodies' | 'lenses' | 'drones', (v: unknown) => boolean][] = [
    ['body', 'bodies', isStoredBody],
    ['lens', 'lenses', isStoredLens],
    ['drone', 'drones', isStoredDrone],
  ]
  for (const [kind, key, isReadable] of kinds) {
    for (const entry of storedList(rawProfile, key) ?? []) {
      if (isReadable(entry)) continue
      unreadable.push({ kind, fragment: describeDropped(kind, entry) })
    }
  }

  /*
   * THE WHOLE PROFILE FELL BACK. reviveKitProfile returns the shipped kit if
   * the stored lenses, bodies or drones are not arrays, which silently
   * replaces everything. Detected by storage having had a profile at all
   * while one of the three lists was not a list.
   */
  const hadProfile = typeof rawProfile === 'object' && rawProfile !== null
  const profileReplaced =
    hadProfile &&
    (['bodies', 'lenses', 'drones'] as const).some((key) => storedList(rawProfile, key) === null)

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

  /*
   * ONE LINE PER DROPPED ENTRY, carrying what was legible in it.
   *
   * Not a count. The point of the line is knowing WHICH lens to re-add, and
   * "1 stored lens could not be read back" does not say. Where nothing was
   * legible the line says that instead of describing something it cannot
   * describe: an invented name on a loss notice is the same failure as an
   * invented reading anywhere else in this app.
   */
  for (const entry of audit.unreadable) {
    const what = KIND_WORD[entry.kind].one
    lines.push({
      tone: 'loss',
      text:
        entry.fragment === null
          ? `A stored ${what} could not be read back and is no longer here. Nothing in it was legible, so there is nothing to go on: check the list against what you own.`
          : /*
             * No second full stop after a fragment that was truncated: the
             * cap already ends it in an ellipsis, and "xxx.... Add it again"
             * reads like a typo in the one line that has to be trusted.
             */
            `A stored ${what} could not be read back and is no longer here. It looked like: ${entry.fragment}${
              entry.fragment.endsWith('...') ? '' : '.'
            } Add it again if you still have it.`,
    })
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

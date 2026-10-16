import { LEAF_COPY } from '../core/leaf.ts'
import type { Blocker } from '../core/sightline.ts'
import { MARK_LABEL, type SiteMark } from '../core/siteMark.ts'

/**
 * WHAT IS IN THE WAY, SAID AS A MEASUREMENT.
 *
 * "A blocked position says it is blocked and by what."
 *
 * Every number in these sentences was computed from a mark the shooter made:
 * what it is, how tall they said it is, how far along the sightline it sits,
 * and how far above the line it reaches. Nothing is inferred about anything
 * that is not marked.
 *
 * AND NOTHING HERE HAS A SENTENCE FOR THE EMPTY CASE. A position with no
 * blockers gets no line at all, because the only true sentence would be
 * "nothing is marked between here and the subject", and on a screen beside a
 * plan that reads as reassurance. The absence of a line is the honest absence.
 * See the hard rule in src/core/siteMark.ts.
 */

const metres = (value: number): string => `${Math.round(value)} m`

/** One blocker, named, measured, and dated if the date is why. */
export function blockerLine(blocker: Blocker, marks: readonly SiteMark[]): string {
  const mark = marks.find((m) => m.id === blocker.markId)
  const what = mark === undefined ? 'Something marked' : MARK_LABEL[mark.kind]
  const where = `${metres(blocker.atMeters)} along`
  const over = `${metres(blocker.overMeters)} above the line`

  const base = `${what}, ${metres(blocker.topMeters)} tall, ${where} and ${over}.`
  if (!blocker.seasonal) return base
  return `${base} ${capitalise(LEAF_COPY[blocker.leaf])}.`
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The one-line summary for the top of a card.
 *
 * Says how many and what the worst one is. Never says a position is fine.
 */
export function blockedLine(blockers: readonly Blocker[], marks: readonly SiteMark[]): string | null {
  if (blockers.length === 0) return null
  const worst = blockers[0]
  const mark = marks.find((m) => m.id === worst.markId)
  const what = mark === undefined ? 'something marked' : MARK_LABEL[mark.kind].toLowerCase()
  /*
   * NO VERB TO AGREE. "Trees" is plural and "building" is singular, and the
   * kinds are a mixed bag, so a sentence with a verb in it reads as "marked
   * trees stands in the way" for half of them. A label and a colon is correct
   * for all of them and is shorter, which on a card head is the better of the
   * two anyway.
   */
  if (blockers.length === 1) return `In the way: marked ${what}.`
  return `In the way: ${blockers.length} marked obstructions. Worst: ${what}.`
}

/**
 * The map word for a blocked position. Short, because it sits on a 30px marker.
 */
export const BLOCKED_WORD = 'blocked'

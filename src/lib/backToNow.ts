/*
 * BACK TO NOW, the dock's last button: the current time, at the venue.
 *
 * The time bar is a fraction of the shoot window, and it already runs past
 * both ends (the Sky calendar jumps it to other nights), so now is simply
 * the fraction where now falls. If today, on the VENUE's calendar, is not the
 * planned shoot day, the date becomes today first: a plan for next Saturday
 * cannot show this minute's sun, and pretending it can would be the bar
 * reading a time that is not on the plan.
 */
import { localDate } from '../core/moonTimes.ts'
import { resolveWindow, type VenueDraft } from './venue.ts'

export interface BackToNow {
  /** The date to set, or null to leave the shoot day alone. */
  date: string | null
  /** The time bar's fraction of the (possibly new) window. */
  scrub: number
}

export function backToNow(venue: VenueDraft, now: Date): BackToNow | null {
  const planned = resolveWindow(venue)
  if (planned === null) return null
  const today = localDate(now, planned.timeZone)
  const date = today === venue.date ? null : today
  const window = date === null ? planned : resolveWindow({ ...venue, date })
  if (window === null) return null
  const span = Math.max(60_000, window.end.getTime() - window.start.getTime())
  return { date, scrub: (now.getTime() - window.start.getTime()) / span }
}

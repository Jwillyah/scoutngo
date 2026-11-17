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

/**
 * WHERE THE TIME BAR OPENS. At now when today, at the venue, is the shoot
 * day; otherwise the middle of the window. On 27 Oct at Virginia Beach a
 * morning visit opened at 5:00 PM, the middle of a saved afternoon window.
 */
export function openingScrub(venue: VenueDraft, now: Date): number {
  const planned = resolveWindow(venue)
  if (planned === null) return 0.5
  if (localDate(now, planned.timeZone) !== venue.date) return 0.5
  const span = Math.max(60_000, planned.end.getTime() - planned.start.getTime())
  return (now.getTime() - planned.start.getTime()) / span
}

/*
 * OPENING THE APP AGAIN IS NOW (Batch FIX, Section 2.1; phone, 17 Nov 7:05
 * AM: the map read "Tue 2 PM"). The home-screen app is resumed far more than
 * it is launched (failure-modes C, the build check): iOS keeps the page, and
 * with it the bar wherever it was left the night before. A launch and a
 * return from the home already go to now (App.tsx); a resume did nothing at
 * all. Back in front after RESUME_NOW_MS or more, the map goes to now as if
 * it were opened. A glance at a message and back (less than that) keeps the
 * hour someone is reading.
 */
export const RESUME_NOW_MS = 10 * 60_000

/** Whether coming back to the app at `shownAt` (epoch ms), having left it at `hiddenAt`, opens the map at now. */
export function resumeGoesToNow(hiddenAt: number | null, shownAt: number): boolean {
  return hiddenAt !== null && shownAt - hiddenAt >= RESUME_NOW_MS
}

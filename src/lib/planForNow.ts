/*
 * "PLAN FOR NOW", WHEN THE SAVED SHOOT WINDOW IS NOT THIS ONE.
 *
 * WHAT HAPPENED. At Virginia Beach at sunrise on 27 Oct the shoot card read
 * "3:00 PM–7:00 PM", a window saved for an afternoon, and the time bar opened
 * at 5:00 PM. The shooter was standing on the beach in the morning.
 *
 * So when the saved window is over, or is on today but in the other half of
 * the day, or is on a day already gone, one tap moves it to now: today, from
 * this quarter hour, for as long as the saved window ran. Nothing changes
 * until it is tapped.
 */
import { localDate } from '../core/moonTimes.ts'
import { formatClock } from '../core/timezone.ts'
import { resolveWindow, type VenueDraft } from './venue.ts'

export interface PlanForNow {
  date: string
  startTime: string
  endTime: string
}

const MINUTE = 60_000
const pad = (n: number) => String(n).padStart(2, '0')

/** The venue's wall clock for an instant, from the one formatter (src/core/timezone.ts), 24 hour. */
function wallClock(at: Date, timeZone: string): { h: number; m: number } {
  const [h, m] = formatClock(at, timeZone, 24).split(':').map(Number)
  /* "--:--" for a zone the formatter cannot read: midnight, never NaN. */
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 }
}

/** The offer, or null when the saved window is still this one. */
export function planForNow(venue: VenueDraft, now: Date): PlanForNow | null {
  const window = resolveWindow(venue)
  if (window === null) return null
  const today = localDate(now, window.timeZone)
  const t = now.getTime()
  const sameDay = venue.date === today
  if (venue.date > today) return null
  if (sameDay) {
    if (t >= window.start.getTime() && t <= window.end.getTime()) return null
    const half = (at: Date) => (wallClock(at, window.timeZone).h < 12 ? 'am' : 'pm')
    /* Later today, in the same half of the day: still the plan. */
    if (t < window.start.getTime() && half(now) === half(window.start)) return null
  }
  const span = Math.max(30, Math.round((window.end.getTime() - window.start.getTime()) / MINUTE))
  const clock = wallClock(now, window.timeZone)
  const from = clock.h * 60 + Math.floor(clock.m / 15) * 15
  /* The window stays on today: it ends by 23:59 rather than running into tomorrow. */
  const to = Math.min(23 * 60 + 59, from + span)
  return { date: today, startTime: `${pad(Math.floor(from / 60))}:${pad(from % 60)}`, endTime: `${pad(Math.floor(to / 60))}:${pad(to % 60)}` }
}

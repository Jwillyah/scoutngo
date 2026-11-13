/*
 * THE PLANNER'S "NOW" (Batch NOW, Section 5): this minute at the venue, as
 * the plan's window, so the planner goes straight to what the light, the
 * shadows, the wind and the sun are doing now. The window is NOW_SPAN_MIN
 * from this minute, on the venue's own clock, and never past midnight.
 */
import { deviceTimeZone, venueTimeZone, wallClock } from './timezone.ts'

export const NOW_SPAN_MIN = 60

const two = (n: number) => String(n).padStart(2, '0')

export function nowWindow(now: Date, lat: number, lon: number): { date: string; startTime: string; endTime: string } {
  const timeZone = venueTimeZone(lat, lon) ?? deviceTimeZone()
  /* The venue's date and wall clock (src/core/timezone.ts), as the plan's fields store them. */
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const w = wallClock(now, timeZone) ?? { hour: now.getUTCHours(), minute: now.getUTCMinutes() }
  const a = { date, h: w.hour, m: w.minute }
  const endMin = Math.min(23 * 60 + 59, a.h * 60 + a.m + NOW_SPAN_MIN)
  return { date: a.date, startTime: `${two(a.h)}:${two(a.m)}`, endTime: `${two(Math.floor(endMin / 60))}:${two(endMin % 60)}` }
}

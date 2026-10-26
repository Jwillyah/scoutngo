/*
 * MOONRISE AND MOONSET ON THE VENUE'S OWN DAY.
 *
 * WHY THIS WRAPS suncalc. suncalc 2.0.2's getMoonTimes resets the date it is
 * given to UTC midnight (setUTCHours(0, 0, 0, 0)) and scans that UTC day. Its
 * own comment says to pass a local midnight for a local day, and the reset
 * throws the local midnight away. For a venue on Eastern Daylight Time the
 * scan runs from 8 PM the evening before to 8 PM on the day: a moonrise after
 * 8 PM is missed, and the evening before's is handed back as today's. A full
 * moon that rises after sunset on the West Coast (after 00:00 UTC) lands on
 * the wrong day altogether.
 *
 * So the day asked for is the VENUE's civil day, midnight to midnight in its
 * own zone (23 or 25 hours across a daylight saving change). suncalc is asked
 * for every UTC day that local day overlaps, and the first rise and the first
 * set inside it are kept. A day can have neither -- the moon's day is about
 * fifty minutes longer than ours -- and that is null, never a borrowed time.
 *
 * THE ONE CALLER OF getMoonTimes. moonTimes.test.ts fails on any other.
 * Measured against the Old Farmer's Almanac at Virginia Beach:
 * measurements/2026-10-25-moonrise-virginia-beach.md.
 */
import { getMoonTimes } from 'suncalc'
import { venueTimeZone, zonedTimeToUtc } from './timezone.ts'

export interface LocalMoonTimes {
  rise: Date | null
  set: Date | null
  /** The local day scanned, yyyy-mm-dd in the venue's zone. */
  date: string
  timeZone: string
}

const DAY = 86_400_000
const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** yyyy-mm-dd on the zone's calendar at an instant. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** The day after a yyyy-mm-dd, on the calendar, not by adding 24 hours. */
function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/**
 * Moonrise and moonset on the venue's civil day containing `at`. The zone is
 * the venue's own, from its coordinate, unless one is given.
 */
export function moonTimesOnLocalDay(
  at: Date,
  lat: number,
  lon: number,
  timeZone: string = venueTimeZone(lat, lon) ?? 'UTC',
): LocalMoonTimes {
  const date = localDate(at, timeZone)
  const start = zonedTimeToUtc(date, '00:00', timeZone)
  const end = zonedTimeToUtc(nextDate(date), '00:00', timeZone)
  if (start === null || end === null) return { rise: null, set: null, date, timeZone }

  const rises: Date[] = []
  const sets: Date[] = []
  for (let day = Math.floor(start.getTime() / DAY) * DAY; day < end.getTime(); day += DAY) {
    const t = getMoonTimes(new Date(day), lat, lon)
    if (usable(t.rise)) rises.push(t.rise)
    if (usable(t.set)) sets.push(t.set)
  }
  const inside = (list: Date[]) =>
    list.filter((d) => d.getTime() >= start.getTime() && d.getTime() < end.getTime()).sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  return { rise: inside(rises), set: inside(sets), date, timeZone }
}

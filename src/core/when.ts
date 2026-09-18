/*
 * Turning "Saturday" into a date.
 *
 * RESOLVED IN CODE, NOT BY THE MODEL, and resolved against the clock at the
 * VENUE. "Saturday" typed on a Friday night in California about a shoot in
 * Maryland is a different Saturday depending on which clock you ask, and a
 * language model asked to do calendar arithmetic against "today" has no reliable
 * idea what today is. The model's job is to notice that the text said Saturday.
 * Working out which Saturday is arithmetic, so it happens here.
 */

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

export type Weekday = (typeof WEEKDAYS)[number]

/** yyyy-mm-dd, and the weekday index, as the given zone sees an instant. */
export function calendarInZone(
  at: Date,
  timeZone: string,
): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  const short = get('weekday').toLowerCase()
  const weekday = WEEKDAYS.findIndex((day) => day.startsWith(short))

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: weekday === -1 ? 0 : weekday,
  }
}

/** Adds whole days to a yyyy-mm-dd, with no timezone involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Resolves what the model noticed into an actual date.
 *
 * Accepts an explicit yyyy-mm-dd unchanged, or a relative token: today,
 * tomorrow, a weekday, or "next" plus a weekday.
 *
 * A BARE WEEKDAY INCLUDES TODAY. Someone typing "Saturday" on a Saturday morning
 * means today, not in a week. "next saturday" is strictly after today, which is
 * the reading that differs. Both land in the visible date field, so a wrong guess
 * is one the shooter can see and correct rather than one buried in a request.
 */
export function resolveDate(raw: string, now: Date, timeZone: string): string | null {
  const text = raw.trim().toLowerCase()
  if (text === '') return null
  if (ISO_DATE.test(text)) return text

  const { date: today, weekday: todayIndex } = calendarInZone(now, timeZone)
  if (text === 'today') return today
  if (text === 'tomorrow') return addDays(today, 1)

  const next = text.startsWith('next ')
  const dayName = next ? text.slice(5).trim() : text
  const target = WEEKDAYS.indexOf(dayName as Weekday)
  if (target === -1) return null

  const ahead = (target - todayIndex + 7) % 7
  if (next) return addDays(today, ahead === 0 ? 7 : ahead)
  return addDays(today, ahead)
}

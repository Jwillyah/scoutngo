/*
 * IS TODAY THE SHOOT DAY, at the venue.
 *
 * The venue's calendar, not the phone's: a shooter in California planning a
 * dawn shoot in Virginia is on the shoot day three hours before their own
 * clock says so. Used for the one line that only means something on the day:
 * check today's flight restrictions.
 */
export function venueToday(now: Date, timeZone: string): string {
  /* en-CA formats as YYYY-MM-DD, the same shape the date field stores. */
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function isEventDay(date: string, timeZone: string, now: Date): boolean {
  return date !== '' && date === venueToday(now, timeZone)
}

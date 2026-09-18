import { describe, expect, it } from 'vitest'
import { addDays, calendarInZone, resolveDate } from './when.ts'

/* 2026-09-18 is a Friday. 16:00 UTC is 12:00 in New York, 09:00 in Los Angeles. */
const FRIDAY = new Date('2026-09-18T16:00:00Z')

describe('calendarInZone', () => {
  it('reads the date and weekday the zone actually sees', () => {
    expect(calendarInZone(FRIDAY, 'America/New_York')).toEqual({
      date: '2026-09-18',
      weekday: 5,
    })
  })

  /*
   * THE REASON THIS TAKES A ZONE. Late evening on the US east coast is already
   * the next day in London, and a shoot is dated by the venue's calendar.
   */
  it('can be a different day in two zones at the same instant', () => {
    const lateFriday = new Date('2026-09-19T02:00:00Z')
    expect(calendarInZone(lateFriday, 'America/New_York').date).toBe('2026-09-18')
    expect(calendarInZone(lateFriday, 'Europe/London').date).toBe('2026-09-19')
  })
})

describe('addDays', () => {
  it('adds days without touching timezones', () => {
    expect(addDays('2026-09-18', 1)).toBe('2026-09-19')
    expect(addDays('2026-09-18', 0)).toBe('2026-09-18')
  })

  it('crosses a month and a year end', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('resolveDate', () => {
  const inNY = (raw: string) => resolveDate(raw, FRIDAY, 'America/New_York')

  it('passes an explicit date straight through', () => {
    expect(inNY('2026-09-12')).toBe('2026-09-12')
  })

  it('resolves today and tomorrow', () => {
    expect(inNY('today')).toBe('2026-09-18')
    expect(inNY('tomorrow')).toBe('2026-09-19')
  })

  /* Friday the 18th, so Saturday is the 19th. */
  it('resolves the soonest weekday', () => {
    expect(inNY('saturday')).toBe('2026-09-19')
    expect(inNY('Saturday')).toBe('2026-09-19')
    expect(inNY('sunday')).toBe('2026-09-20')
    expect(inNY('thursday')).toBe('2026-09-24')
  })

  /* Someone typing "Friday" on a Friday morning means today. */
  it('includes today for a bare weekday', () => {
    expect(inNY('friday')).toBe('2026-09-18')
  })

  it('pushes "next" strictly past today', () => {
    expect(inNY('next friday')).toBe('2026-09-25')
    expect(inNY('next saturday')).toBe('2026-09-19')
  })

  /*
   * THE WHOLE POINT OF RESOLVING IN THE VENUE'S ZONE. At 02:00 UTC it is still
   * Friday in New York but already Saturday in London, so "saturday" means two
   * different dates depending on which venue is being shot.
   */
  it('resolves against the venue clock, not the device one', () => {
    const lateFriday = new Date('2026-09-19T02:00:00Z')
    expect(resolveDate('saturday', lateFriday, 'America/New_York')).toBe('2026-09-19')
    expect(resolveDate('saturday', lateFriday, 'Europe/London')).toBe('2026-09-19')
    expect(resolveDate('sunday', lateFriday, 'America/New_York')).toBe('2026-09-20')
    expect(resolveDate('sunday', lateFriday, 'Europe/London')).toBe('2026-09-20')
  })

  it('returns null on anything it cannot read, rather than guessing', () => {
    expect(inNY('')).toBeNull()
    expect(inNY('whenever')).toBeNull()
    expect(inNY('the 4th')).toBeNull()
  })
})

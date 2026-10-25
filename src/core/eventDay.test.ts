import { describe, expect, it } from 'vitest'
import { isEventDay, venueToday } from './eventDay.ts'

describe('the shoot day is the venue calendar', () => {
  /* 03:30 UTC on the 26th is still the evening of the 25th in Virginia. */
  const now = new Date('2026-10-26T03:30:00Z')

  it('reads the date where the venue is, not in UTC', () => {
    expect(venueToday(now, 'America/New_York')).toBe('2026-10-25')
    expect(venueToday(now, 'UTC')).toBe('2026-10-26')
  })

  it('is the shoot day only on the date itself', () => {
    expect(isEventDay('2026-10-25', 'America/New_York', now)).toBe(true)
    expect(isEventDay('2026-10-26', 'America/New_York', now)).toBe(false)
    expect(isEventDay('', 'America/New_York', now)).toBe(false)
  })
})

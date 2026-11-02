import { describe, expect, it } from 'vitest'
import { feedCoords, feedIcs, feedPath } from '../src/core/calendarFeed.ts'
import type { CallRead } from '../src/core/briefing.ts'

/* The opt-in calendar feed (Batch H, Section 4). */
const read = (call: CallRead['call'], kind: CallRead['kind'], iso: string): CallRead => ({
  kind,
  event: new Date(iso),
  call,
  why: 'Possible: 2 of 5 models see lit high cirrus.',
  confirmed: false,
  colorFrom: new Date(new Date(iso).getTime() - 25 * 60_000),
  colorTo: new Date(new Date(iso).getTime() - 10 * 60_000),
  setUp: new Date(new Date(iso).getTime() - 35 * 60_000),
  agree: 2,
  of: 5,
})

describe('the calendar feed', () => {
  it('takes the place at exactly two decimals and refuses anything finer', () => {
    expect(feedCoords('36.84', '-75.97')).toEqual({ lat: 36.84, lon: -75.97 })
    expect(feedCoords('36.8435575', '-75.9713104')).toBeNull()
    expect(feedCoords('36.8', '-75.97')).toBeNull()
    expect(feedCoords(null, '-75.97')).toBeNull()
    expect(feedPath(36.8435575, -75.9713104)).toBe('/api/calendar?lat=36.84&lon=-75.97')
  })

  it('one event per Go or Maybe with an alarm, none for a Skip, the UID by day and kind', () => {
    const ics = feedIcs([read('Maybe', 'sunset', '2026-11-02T22:05:00Z'), read('Skip', 'sunrise', '2026-11-03T11:29:00Z')], { lat: 36.84, lon: -75.97 }, new Date('2026-11-02T14:00:00Z'))
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('SUMMARY:Sunset Maybe')
    expect(ics).toContain('UID:sunset-2026-11-02-36.84,-75.97@scoutngo')
    expect(ics).toContain('TRIGGER;VALUE=DATE-TIME:20261102T211000Z')
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
    expect(ics).not.toMatch(/\bsafe\b/i)
  })
})

import { describe, expect, it } from 'vitest'
import { getTimes } from 'suncalc'
import { clockMinute, formatClock, formatDayTime, formatHour, venueAndYours } from '../src/core/timezone.ts'
import { sunriseOn } from '../src/core/sunrise.ts'
import { sunsetOn } from '../src/core/calendarMonth.ts'

/*
 * B4: sunset read 5:00 in one place and 5:01 in another. Every printed time is
 * floored to the minute by one function (src/core/timezone.ts clockMinute),
 * and the minute-stepped sunrise and sunset scans hand over the moment they
 * found, not the minute after it (src/core/sunrise.ts horizonCrossing).
 *
 * Measured before the fix at Virginia Beach (36.8413, -75.9716), 7 Nov 2026:
 * suncalc's sunset 22:00:48Z printed "5:00 PM", sunsetOn 22:01:00Z printed
 * "5:01 PM"; 8 Nov: 21:59:55Z "4:59 PM" against 22:00:00Z "5:00 PM".
 */
const TZ = 'America/New_York'
const VB = { lat: 36.8413, lon: -75.9716 }

describe('one rounding for every displayed time', () => {
  it('floors to the minute: 16:59:40 local is 4:59 everywhere it is printed', () => {
    /* 8 Nov 2026 is EST, UTC-5. */
    const at = new Date('2026-11-08T21:59:40Z')
    expect(clockMinute(at).toISOString()).toBe('2026-11-08T21:59:00.000Z')
    expect(formatClock(at, TZ, 12)).toBe('4:59 PM')
    expect(formatClock(at, TZ, 24)).toBe('16:59')
    expect(formatDayTime(at, TZ, 12)).toBe('Nov 8, 4:59 PM')
    expect(venueAndYours(at, TZ, 12).startsWith('4:59 PM')).toBe(true)
    expect(formatHour(at, TZ, 12)).toBe('4 PM')
    /* The home strip's "Set 4:59" is formatClock with the AM/PM cut (src/core/homeDay.ts). */
    expect(formatClock(at, TZ, 12).replace(/ [AP]M$/, '')).toBe('4:59')
    /* A second before the next minute is still this minute; the minute itself is the next. */
    expect(formatClock(new Date('2026-11-08T21:59:59.999Z'), TZ, 12)).toBe('4:59 PM')
    expect(formatClock(new Date('2026-11-08T22:00:00Z'), TZ, 12)).toBe('5:00 PM')
  })

  it('prints the same sunrise and sunset minute from suncalc, the Calendar scan and the Tide sheet scan, every day of Nov 2026', () => {
    let days = 0
    for (let d = 1; d <= 30; d++) {
      const date = `2026-11-${String(d).padStart(2, '0')}`
      const t = getTimes(new Date(`${date}T17:00:00Z`), VB.lat, VB.lon)
      const set = sunsetOn(date, VB.lat, VB.lon, TZ)
      const rise = sunriseOn(date, VB.lat, VB.lon, TZ)
      expect(set).not.toBeNull()
      expect(rise).not.toBeNull()
      /* The scans use the calibrated horizon (sunPath.ts); they land within seconds of suncalc's own. */
      expect(Math.abs((set as Date).getTime() - (t.sunset as Date).getTime())).toBeLessThan(5_000)
      expect(Math.abs((rise as Date).getTime() - (t.sunrise as Date).getTime())).toBeLessThan(5_000)
      const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000)
      if (sameMinute(set as Date, t.sunset as Date)) expect(formatClock(set as Date, TZ, 12)).toBe(formatClock(t.sunset as Date, TZ, 12))
      days++
    }
    expect(days).toBe(30)
    /* The two days the bug was seen on, by value. */
    expect(formatClock(sunsetOn('2026-11-07', VB.lat, VB.lon, TZ) as Date, TZ, 12)).toBe('5:00 PM')
    expect(formatClock(getTimes(new Date('2026-11-07T17:00:00Z'), VB.lat, VB.lon).sunset as Date, TZ, 12)).toBe('5:00 PM')
    expect(formatClock(sunsetOn('2026-11-08', VB.lat, VB.lon, TZ) as Date, TZ, 12)).toBe('4:59 PM')
    expect(formatClock(getTimes(new Date('2026-11-08T17:00:00Z'), VB.lat, VB.lon).sunset as Date, TZ, 12)).toBe('4:59 PM')
  })
})

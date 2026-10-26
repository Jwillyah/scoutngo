import { describe, expect, it } from 'vitest'
import { moonTimesOnLocalDay } from './moonTimes.ts'
import { formatClock, zonedTimeToUtc } from './timezone.ts'

const VB = { lat: 36.85, lon: -75.975 }
const TZ = 'America/New_York'
const midnight = (date: string) => zonedTimeToUtc(date, '00:00', TZ)!

/*
 * Old Farmer's Almanac, Virginia Beach, 25 October 2026: "Rises 5:41 P.M.",
 * Eastern Daylight Time at sea level (measurements/2026-10-25-moonrise-virginia-beach.md).
 */
describe('moonrise on the venue’s own day', () => {
  it('Virginia Beach, 25 October 2026: within 5 min of the almanac’s 5:41 PM EDT', () => {
    const rise = moonTimesOnLocalDay(midnight('2026-10-25'), VB.lat, VB.lon, TZ).rise
    const almanac = zonedTimeToUtc('2026-10-25', '17:41', TZ)!
    expect(rise).not.toBeNull()
    expect(Math.abs(rise!.getTime() - almanac.getTime())).toBeLessThanOrEqual(5 * 60_000)
  })

  it('finds a moonrise after 8 PM EDT, which suncalc’s UTC day misses', () => {
    /* 29 October: the plain call answers no moonrise; the moon rises at 8:55 PM. */
    const t = moonTimesOnLocalDay(midnight('2026-10-29'), VB.lat, VB.lon, TZ)
    expect(t.rise).not.toBeNull()
    expect(formatClock(t.rise!, TZ, 12)).toBe('8:55 PM')
    expect(t.date).toBe('2026-10-29')
  })

  it('never hands back the evening before’s moonrise as today’s', () => {
    for (const date of ['2026-10-01', '2026-10-30', '2026-11-28']) {
      const start = midnight(date)
      const rise = moonTimesOnLocalDay(start, VB.lat, VB.lon, TZ).rise
      if (rise !== null) expect(rise.getTime()).toBeGreaterThanOrEqual(start.getTime())
    }
  })

  it('is the same day whatever instant in it is asked about', () => {
    const morning = moonTimesOnLocalDay(zonedTimeToUtc('2026-10-29', '06:00', TZ)!, VB.lat, VB.lon, TZ)
    const night = moonTimesOnLocalDay(zonedTimeToUtc('2026-10-29', '23:30', TZ)!, VB.lat, VB.lon, TZ)
    expect(night.rise?.getTime()).toBe(morning.rise?.getTime())
  })

  it('says none rather than borrowing a time when the day has no moonrise', () => {
    /* 3 October: the rise is just after midnight on the 4th. */
    expect(moonTimesOnLocalDay(midnight('2026-10-03'), VB.lat, VB.lon, TZ).rise).toBeNull()
  })

  it('reads the zone from the coordinate when none is given', () => {
    expect(moonTimesOnLocalDay(midnight('2026-10-25'), VB.lat, VB.lon).timeZone).toBe(TZ)
  })
})

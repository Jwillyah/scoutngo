import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatOffset,
  isAwayFromDevice,
  venueTimeZone,
  zoneAbbreviation,
  zoneLabel,
  zoneOffsetMs,
  zonedTimeToUtc,
} from './timezone.ts'

const HOUR = 3600_000

describe('venueTimeZone', () => {
  it('resolves the calibration venue to Eastern', () => {
    expect(venueTimeZone(38.364236, -75.605912)).toBe('America/New_York')
  })

  it('resolves coordinates on the other side of the world', () => {
    expect(venueTimeZone(35.6895, 139.6917)).toBe('Asia/Tokyo')
    expect(venueTimeZone(-33.8688, 151.2093)).toBe('Australia/Sydney')
  })

  it('returns null rather than a wrong zone for an impossible coordinate', () => {
    expect(venueTimeZone(Number.NaN, 0)).toBeNull()
    expect(venueTimeZone(999, 999)).toBeNull()
  })
})

describe('zoneOffsetMs', () => {
  it('reads daylight and standard time from the platform tz database', () => {
    expect(zoneOffsetMs(new Date('2026-09-12T15:00:00Z'), 'America/New_York')).toBe(-4 * HOUR)
    expect(zoneOffsetMs(new Date('2026-01-12T15:00:00Z'), 'America/New_York')).toBe(-5 * HOUR)
  })

  it('handles a zone on a half hour offset', () => {
    expect(zoneOffsetMs(new Date('2026-09-12T15:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * HOUR)
  })

  it('is not thrown off by milliseconds on the instant', () => {
    expect(zoneOffsetMs(new Date('2026-09-12T15:00:00.750Z'), 'America/New_York')).toBe(-4 * HOUR)
  })
})

describe('zonedTimeToUtc', () => {
  /*
   * THE REGRESSION TEST FOR THE WHOLE JOB. 11:00 at the calibration venue is
   * 15:00 UTC because Maryland is on EDT in September. If this ever comes back as
   * 11:00 UTC, or as 11:00 in whatever zone the machine running the suite is set
   * to, then times are being read in the device timezone again and every lighting
   * class in the app is wrong by the difference.
   */
  it('reads a wall clock time at the venue, not on this device', () => {
    const at = zonedTimeToUtc('2026-09-12', '11:00', 'America/New_York')
    expect(at?.toISOString()).toBe('2026-09-12T15:00:00.000Z')
  })

  it('gives the same wall clock a different instant in a different zone', () => {
    const eastern = zonedTimeToUtc('2026-09-12', '11:00', 'America/New_York')
    const pacific = zonedTimeToUtc('2026-09-12', '11:00', 'America/Los_Angeles')
    expect(pacific!.getTime() - eastern!.getTime()).toBe(3 * HOUR)
  })

  it('applies standard time out of season, not a fixed offset', () => {
    const summer = zonedTimeToUtc('2026-07-01', '11:00', 'America/New_York')
    const winter = zonedTimeToUtc('2026-01-01', '11:00', 'America/New_York')
    expect(summer?.toISOString()).toBe('2026-07-01T15:00:00.000Z')
    expect(winter?.toISOString()).toBe('2026-01-01T16:00:00.000Z')
  })

  it('round trips: the instant formats back to the wall clock that named it', () => {
    for (const zone of ['America/New_York', 'Asia/Tokyo', 'Asia/Kathmandu', 'Pacific/Auckland']) {
      for (const time of ['00:00', '06:30', '11:00', '23:45']) {
        const at = zonedTimeToUtc('2026-09-12', time, zone)
        expect(formatClock(at!, zone), `${zone} ${time}`).toBe(time)
      }
    }
  })

  /*
   * The hour either side of a DST change is where a one pass conversion gets it
   * wrong. US Eastern falls back at 02:00 local on 1 November 2026.
   */
  it('gets the hours around a daylight saving change right', () => {
    expect(zonedTimeToUtc('2026-11-01', '00:30', 'America/New_York')?.toISOString()).toBe(
      '2026-11-01T04:30:00.000Z',
    )
    expect(zonedTimeToUtc('2026-11-01', '09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-11-01T14:00:00.000Z',
    )
    /*
     * Spring forward, 8 March 2026: the clock jumps 02:00 EST to 03:00 EDT, so
     * 03:00 that morning is already daylight time at UTC-4, not UTC-5. A one pass
     * conversion answers 08:00Z here, which is an hour of sun out.
     */
    expect(zonedTimeToUtc('2026-03-08', '03:00', 'America/New_York')?.toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    )
  })

  it('returns null on input it cannot read', () => {
    expect(zonedTimeToUtc('not-a-date', '11:00', 'America/New_York')).toBeNull()
    expect(zonedTimeToUtc('2026-09-12', 'noon', 'America/New_York')).toBeNull()
  })
})

describe('formatClock', () => {
  it('shows the venue wall clock, not the device one', () => {
    const noonUtc = new Date('2026-09-12T12:00:00Z')
    expect(formatClock(noonUtc, 'America/New_York')).toBe('08:00')
    expect(formatClock(noonUtc, 'Asia/Tokyo')).toBe('21:00')
    expect(formatClock(noonUtc, 'UTC')).toBe('12:00')
  })

  it('uses a 24 hour clock with no midnight 24', () => {
    expect(formatClock(new Date('2026-09-12T04:00:00Z'), 'America/New_York')).toBe('00:00')
  })
})

describe('labels', () => {
  const september = new Date('2026-09-12T15:00:00Z')
  const january = new Date('2026-01-12T15:00:00Z')

  it('writes the offset the way a person reads it', () => {
    expect(formatOffset(september, 'America/New_York')).toBe('UTC-4')
    expect(formatOffset(september, 'Asia/Tokyo')).toBe('UTC+9')
    expect(formatOffset(september, 'Asia/Kathmandu')).toBe('UTC+5:45')
    expect(formatOffset(september, 'UTC')).toBe('UTC+0')
  })

  it('names daylight and standard time separately', () => {
    expect(zoneAbbreviation(september, 'America/New_York')).toBe('EDT')
    expect(zoneAbbreviation(january, 'America/New_York')).toBe('EST')
  })

  it('falls back to the offset where there is no abbreviation', () => {
    expect(zoneAbbreviation(september, 'Asia/Kathmandu')).toBeNull()
    expect(zoneLabel(september, 'Asia/Kathmandu')).toBe('UTC+5:45')
  })

  it('reads as one plain phrase', () => {
    expect(zoneLabel(september, 'America/New_York')).toBe('EDT, UTC-4')
  })
})

describe('isAwayFromDevice', () => {
  it('is false for the zone this device is actually in', () => {
    expect(isAwayFromDevice(Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(false)
  })

  it('is true for somewhere else', () => {
    // Whatever the suite is running in, it is not both of these.
    const away = ['America/New_York', 'Asia/Tokyo'].filter(isAwayFromDevice)
    expect(away.length).toBeGreaterThanOrEqual(1)
  })
})

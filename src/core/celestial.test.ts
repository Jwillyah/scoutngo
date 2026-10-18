import { describe, expect, it } from 'vitest'
import {
  equatorialToHorizontal,
  GALACTIC_CORE,
  greenwichMeanSiderealTime,
  julianDay,
  showerById,
  SHOWERS,
} from './celestial.ts'

/*
 * THE REFERENCE VALUES ARE PUBLISHED EPHEMERIS, NOT THIS CODE'S OWN OUTPUT.
 *
 * Source: JPL Horizons, ssd.jpl.nasa.gov/api/horizons.api, queried 2026-10-18
 * with EPHEM_TYPE='OBSERVER', CENTER='coord@399' (a topocentric site),
 * QUANTITIES='2,4', ANG_FORMAT='DEG', APPARENT='AIRLESS'.
 *
 * Quantity 2 is apparent RA and Dec referred to the true equator and equinox
 * of date, AS SEEN FROM THE SITE, so topocentric parallax is already in it.
 * Quantity 4 is apparent azimuth and elevation, azimuth measured clockwise
 * from north. That pairing is exactly what this transform has to reproduce: a
 * rotation from one to the other with no physics left to do.
 *
 * AIRLESS, deliberately. Horizons will apply refraction if asked and this file
 * does not model refraction, so asking for it would be comparing two different
 * quantities and calling the difference an error.
 *
 * FOUR SITES, CHOSEN TO EXERCISE THE EQUATIONS rather than to be convenient:
 * mid-northern, southern, equatorial and sub-arctic, with the body east and
 * west of the meridian and declinations of both signs. A transform that has
 * latitude or the azimuth quadrant wrong cannot pass all four.
 *
 * The exact queries and the residual for each row were written to
 * measurements/2026-10-18-celestial-vs-horizons.md by the run that produced
 * this table.
 */
const HORIZONS = [
  {
    what: 'Moon from Washington DC',
    ra: 337.51974,
    dec: -9.55589,
    lat: 38.9,
    lon: -77.0,
    utc: '2026-10-21T23:00:00Z',
    azimuth: 134.417627,
    altitude: 29.417795,
  },
  {
    what: 'Jupiter from Sydney',
    ra: 125.62312,
    dec: 19.88012,
    lat: -33.868,
    lon: 151.209,
    utc: '2026-07-15T01:00:00Z',
    azimuth: 29.190102,
    altitude: 30.61351,
  },
  {
    what: 'Venus from Quito',
    ra: 291.77375,
    dec: -22.74809,
    lat: -0.18,
    lon: -78.467,
    utc: '2026-01-09T14:00:00Z',
    azimuth: 118.195759,
    altitude: 35.457839,
  },
  {
    what: 'Mars from Tromso',
    ra: 332.28651,
    dec: -12.56965,
    lat: 69.649,
    lon: 18.955,
    utc: '2026-03-02T08:00:00Z',
    azimuth: 147.576753,
    altitude: 4.587551,
  },
] as const

/*
 * The budget is the equation of the equinoxes, which this file does not model.
 * It reaches about 1.1 seconds of time, which is 0.0046 degrees of hour angle.
 * 0.01 is that with room, and it is TIGHT rather than generous: the measured
 * worst case is 0.0024, so a transform that drifted by even a hundredth of a
 * degree would fail here.
 */
const TOLERANCE_DEG = 0.01

describe('equatorialToHorizontal against JPL Horizons', () => {
  for (const row of HORIZONS) {
    it(`matches ${row.what}`, () => {
      const got = equatorialToHorizontal(row.ra, row.dec, row.lat, row.lon, new Date(row.utc))
      expect(got.altitude).toBeCloseTo(row.altitude, 2)
      expect(got.azimuth).toBeCloseTo(row.azimuth, 2)
      expect(Math.abs(got.altitude - row.altitude)).toBeLessThan(TOLERANCE_DEG)
      expect(Math.abs(got.azimuth - row.azimuth)).toBeLessThan(TOLERANCE_DEG)
    })
  }

  it('holds for every row at once, so one lucky case cannot carry the suite', () => {
    const worst = HORIZONS.reduce((acc, row) => {
      const got = equatorialToHorizontal(row.ra, row.dec, row.lat, row.lon, new Date(row.utc))
      return Math.max(acc, Math.abs(got.altitude - row.altitude), Math.abs(got.azimuth - row.azimuth))
    }, 0)
    expect(worst).toBeLessThan(TOLERANCE_DEG)
  })
})

describe('the pieces the transform is built from', () => {
  it('puts the Julian Day epoch where the definition does', () => {
    /* JD 2451545.0 is 2000 January 1 at 12:00 TT, the J2000 epoch. */
    expect(julianDay(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(2451545, 6)
  })

  it('advances sidereal time by about 360.9856 degrees in a solar day', () => {
    const a = greenwichMeanSiderealTime(new Date('2026-03-01T00:00:00Z'))
    const b = greenwichMeanSiderealTime(new Date('2026-03-02T00:00:00Z'))
    const advance = ((b - a) % 360) + 360
    expect(advance % 360).toBeCloseTo(360.98564736629 % 360, 4)
  })

  it('measures azimuth clockwise from north, not from south', () => {
    /*
     * A body on the meridian, due south of a northern observer, at its
     * culmination. Azimuth must read 180, which is the one number that
     * separates this convention from Meeus's.
     */
    const lat = 40
    const ra = 100
    const date = new Date('2026-06-01T00:00:00Z')
    /* Put the hour angle at zero by choosing the longitude that does it. */
    const lon = ra - greenwichMeanSiderealTime(date)
    const got = equatorialToHorizontal(ra, 10, lat, lon, date)
    expect(got.azimuth).toBeCloseTo(180, 3)
    /* And on the meridian the altitude is 90 - |lat - dec|. */
    expect(got.altitude).toBeCloseTo(90 - Math.abs(lat - 10), 3)
  })

  it('returns a negative altitude rather than clamping, because below is a real answer', () => {
    const date = new Date('2026-10-21T18:00:00Z')
    /* The anti-meridian point: hour angle 180, as low as this declination goes. */
    const ra = 100
    const lon = ra + 180 - greenwichMeanSiderealTime(date)
    const got = equatorialToHorizontal(ra, -40, 50, lon, date)
    expect(got.altitude).toBeLessThan(0)
    expect(Number.isFinite(got.altitude)).toBe(true)
  })

  it('is periodic in longitude, so a wrapped venue is the same venue', () => {
    const date = new Date('2026-10-21T04:00:00Z')
    const a = equatorialToHorizontal(95, 16, 38.75, -78.27, date)
    const b = equatorialToHorizontal(95, 16, 38.75, -78.27 + 360, date)
    expect(b.altitude).toBeCloseTo(a.altitude, 9)
    expect(b.azimuth).toBeCloseTo(a.azimuth, 9)
  })
})

describe('the shower table', () => {
  it('carries the eight the brief named, with no duplicates', () => {
    expect(SHOWERS).toHaveLength(8)
    expect(new Set(SHOWERS.map((s) => s.id)).size).toBe(8)
    expect(SHOWERS.map((s) => s.id)).toEqual([
      'quadrantids',
      'lyrids',
      'eta-aquariids',
      'perseids',
      'orionids',
      'leonids',
      'geminids',
      'ursids',
    ])
  })

  it('carries the IMO radiant and rate for the Orionids', () => {
    /* IMO 2025 calendar, 008ORI: Maximum October 21, ZHR 20+, radiant 95, +16. */
    const orionids = showerById('orionids')
    expect(orionids).not.toBeNull()
    expect(orionids?.peakMonth).toBe(10)
    expect(orionids?.peakDay).toBe(21)
    expect(orionids?.radiantRa).toBe(95)
    expect(orionids?.radiantDec).toBe(16)
    expect(orionids?.zhr).toBe(20)
  })

  it('carries the IMO radiant and rate for the Geminids, the other end of the range', () => {
    /* IMO 2025 calendar, 004GEM: Maximum December 14, ZHR 150, radiant 112, +33. */
    const geminids = showerById('geminids')
    expect(geminids?.peakMonth).toBe(12)
    expect(geminids?.peakDay).toBe(14)
    expect(geminids?.radiantRa).toBe(112)
    expect(geminids?.radiantDec).toBe(33)
    expect(geminids?.zhr).toBe(150)
  })

  it('keeps every radiant inside the coordinate ranges that exist', () => {
    for (const shower of SHOWERS) {
      expect(shower.radiantRa).toBeGreaterThanOrEqual(0)
      expect(shower.radiantRa).toBeLessThan(360)
      expect(shower.radiantDec).toBeGreaterThanOrEqual(-90)
      expect(shower.radiantDec).toBeLessThanOrEqual(90)
      expect(shower.peakMonth).toBeGreaterThanOrEqual(1)
      expect(shower.peakMonth).toBeLessThanOrEqual(12)
      expect(shower.zhr).toBeGreaterThan(0)
    }
  })

  it('returns null for an id that is not in the table', () => {
    /* The union makes this unreachable from typed code; it is the runtime floor. */
    expect(showerById('not-a-shower' as never)).toBeNull()
  })

  it('puts the galactic core where Sagittarius A* is', () => {
    expect(GALACTIC_CORE.ra).toBeCloseTo(266.4, 1)
    expect(GALACTIC_CORE.dec).toBeCloseTo(-28.94, 2)
  })

  it('has the Orionid radiant up before dawn in late October from Virginia', () => {
    /*
     * The sanity check that would catch a sign error the Horizons rows might
     * not: at 04:00 local on the peak night the radiant must be well up from
     * Shenandoah, which is the whole premise of shooting this shower there.
     */
    const at = new Date('2026-10-22T08:00:00Z') // 04:00 EDT
    const got = equatorialToHorizontal(95, 16, 38.7567229, -78.2675403, at)
    expect(got.altitude).toBeGreaterThan(40)
    /* And it is in the southern half of the sky, not behind the observer. */
    expect(got.azimuth).toBeGreaterThan(90)
    expect(got.azimuth).toBeLessThan(270)
  })
})

import { describe, expect, it } from 'vitest'
import { bearingBetween } from './geo.ts'
import { getSunPosition } from './sun.ts'
import { signedBearingDelta, sunAimTimes, sunBehindTimes } from './sunInverse.ts'

const SANDBRIDGE = { lat: 36.726, lon: -75.94 }
const day = (iso: string) => new Date(iso)

describe('signed bearing delta', () => {
  it('is the shortest turn, signed', () => {
    expect(signedBearingDelta(10, 20)).toBeCloseTo(10, 6)
    expect(signedBearingDelta(20, 10)).toBeCloseTo(-10, 6)
  })

  it('goes the short way around the back of the compass', () => {
    expect(signedBearingDelta(350, 10)).toBeCloseTo(20, 6)
    expect(signedBearingDelta(10, 350)).toBeCloseTo(-20, 6)
  })

  it('resolves the antipode to +180 rather than oscillating', () => {
    expect(signedBearingDelta(0, 180)).toBe(180)
    expect(signedBearingDelta(180, 0)).toBe(180)
  })
})

describe('the inversion agrees with the forward math', () => {
  /*
   * THE ONLY CHECK THAT MATTERS. Whatever time this returns, asking the
   * forward solver where the sun is at that time must give the bearing that
   * was asked for. The two directions are the same arithmetic and they have to
   * agree, or one of them is wrong.
   */
  it('puts the sun on the requested bearing, to a hundredth of a degree', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-22T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
    })
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      const sun = getSunPosition(hit.at, SANDBRIDGE.lat, SANDBRIDGE.lon)
      expect(Math.abs(signedBearingDelta(sun.azimuth, 254.1))).toBeLessThan(0.01)
      /* And the reported azimuth is the one actually computed at that moment. */
      expect(hit.azimuth).toBeCloseTo(sun.azimuth, 6)
      expect(hit.altitude).toBeCloseTo(sun.altitude, 6)
    }
  })

  it('finds one alignment per day for a westerly bearing', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-22T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
    })
    /* Seven days, one westward crossing each, sun up. */
    expect(hits).toHaveLength(7)
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i].at.getTime()).toBeGreaterThan(hits[i - 1].at.getTime())
    }
  })
})

describe('a narrow tolerance is not stepped over', () => {
  /*
   * THE BUG A TOLERANCE SCAN WOULD HAVE. The sun moves about 15 degrees an
   * hour, so a ten-minute step moves two and a half degrees. A scan that kept
   * samples within a tenth of a degree would find nothing most days, and
   * tightening the tolerance would make it worse. Sign-change detection finds
   * the crossing and bisects it, so a tiny tolerance still returns the moment.
   */
  for (const tolerance of [2, 0.5, 0.1, 0.01]) {
    it(`finds the crossing at a tolerance of ${tolerance} degrees`, () => {
      const hits = sunAimTimes({
        at: SANDBRIDGE,
        from: day('2026-10-15T00:00:00Z'),
        to: day('2026-10-16T00:00:00Z'),
        bearing: 254.1,
        bearingToleranceDeg: tolerance,
        stepMinutes: 10,
      })
      expect(hits, `tolerance ${tolerance}`).toHaveLength(1)
      const sun = getSunPosition(hits[0].at, SANDBRIDGE.lat, SANDBRIDGE.lon)
      expect(Math.abs(signedBearingDelta(sun.azimuth, 254.1))).toBeLessThan(0.01)
    })
  }

  it('finds it even with a deliberately coarse step', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-16T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 0.1,
      stepMinutes: 60,
    })
    expect(hits).toHaveLength(1)
  })
})

describe('the window around each alignment', () => {
  it('brackets the exact moment and widens with the tolerance', () => {
    const query = {
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-16T00:00:00Z'),
      bearing: 254.1,
    }
    const tight = sunAimTimes({ ...query, bearingToleranceDeg: 0.5 })[0]
    const loose = sunAimTimes({ ...query, bearingToleranceDeg: 2 })[0]

    for (const hit of [tight, loose]) {
      expect(hit.from.getTime()).toBeLessThanOrEqual(hit.at.getTime())
      expect(hit.to.getTime()).toBeGreaterThanOrEqual(hit.at.getTime())
    }
    const width = (h: typeof tight) => h.to.getTime() - h.from.getTime()
    expect(width(loose)).toBeGreaterThan(width(tight))
  })

  it('holds the requested bearing across the whole reported window', () => {
    const hit = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-16T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
    })[0]
    for (const t of [hit.from, hit.at, hit.to]) {
      const sun = getSunPosition(t, SANDBRIDGE.lat, SANDBRIDGE.lon)
      /* A hair of slack for the bisection's one-second resolution. */
      expect(Math.abs(signedBearingDelta(sun.azimuth, 254.1))).toBeLessThan(1.05)
    }
  })
})

describe('what it refuses to invent', () => {
  /*
   * THE WRAP GUARD. The signed delta jumps between +180 and -180 at the back
   * of the compass, which is a sign change that is not a crossing. Without the
   * guard every day produced a phantom alignment on the OPPOSITE bearing, so
   * asking for a westerly sun returned easterly mornings as well.
   */
  it('does not report an alignment on the opposite bearing', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-16T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
    })
    for (const hit of hits) {
      expect(Math.abs(signedBearingDelta(hit.azimuth, 254.1))).toBeLessThan(1.05)
      expect(Math.abs(signedBearingDelta(hit.azimuth, 74.1))).toBeGreaterThan(90)
    }
  })

  it('returns nothing for a bearing the sun never reaches here', () => {
    /* Due north, with the sun up, does not happen at this latitude. */
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-22T00:00:00Z'),
      bearing: 0,
      bearingToleranceDeg: 1,
    })
    expect(hits).toEqual([])
  })

  it('returns nothing for an unusable range', () => {
    const base = { at: SANDBRIDGE, bearing: 254.1 }
    expect(
      sunAimTimes({ ...base, from: day('2026-10-16T00:00:00Z'), to: day('2026-10-15T00:00:00Z') }),
    ).toEqual([])
    expect(
      sunAimTimes({ ...base, from: day('2026-10-15T00:00:00Z'), to: day('2026-10-15T00:00:00Z') }),
    ).toEqual([])
  })

  it('returns nothing when asked for neither a bearing nor an altitude', () => {
    expect(
      sunAimTimes({
        at: SANDBRIDGE,
        from: day('2026-10-15T00:00:00Z'),
        to: day('2026-10-22T00:00:00Z'),
        bearing: null,
      }),
    ).toEqual([])
  })

  it('honours the limit rather than returning a year of crossings', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-01-01T00:00:00Z'),
      to: day('2026-12-31T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
      limit: 5,
    })
    expect(hits).toHaveLength(5)
  })
})

describe('the sun-up filter', () => {
  it('drops bearing alignments with the sun underground by default', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-22T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
    })
    for (const hit of hits) expect(hit.altitude).toBeGreaterThan(0)
  })

  it('keeps them when asked to', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-22T00:00:00Z'),
      bearing: 300,
      bearingToleranceDeg: 1,
      requireSunUp: false,
    })
    expect(hits.length).toBeGreaterThan(0)
  })
})

describe('the altitude search, for light that rakes', () => {
  it('finds the times the sun sits at a given altitude', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-16T00:00:00Z'),
      bearing: null,
      altitudeDeg: 5,
      altitudeToleranceDeg: 0.25,
    })
    /* Once climbing, once falling. */
    expect(hits).toHaveLength(2)
    for (const hit of hits) {
      const sun = getSunPosition(hit.at, SANDBRIDGE.lat, SANDBRIDGE.lon)
      expect(Math.abs(sun.altitude - 5)).toBeLessThan(0.01)
    }
  })

  it('finds a negative altitude, which is what blue hour is', () => {
    const hits = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-16T00:00:00Z'),
      bearing: null,
      altitudeDeg: -4,
      altitudeToleranceDeg: 0.25,
    })
    expect(hits).toHaveLength(2)
    for (const hit of hits) expect(hit.altitude).toBeCloseTo(-4, 1)
  })

  it('combines a bearing and an altitude, keeping only what satisfies both', () => {
    const bearingOnly = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-01-01T00:00:00Z'),
      to: day('2026-12-31T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
      limit: 400,
    })
    const both = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-01-01T00:00:00Z'),
      to: day('2026-12-31T00:00:00Z'),
      bearing: 254.1,
      bearingToleranceDeg: 1,
      altitudeDeg: 10,
      altitudeToleranceDeg: 1,
      limit: 400,
    })
    /* Adding a constraint can only narrow the set. */
    expect(both.length).toBeGreaterThan(0)
    expect(both.length).toBeLessThan(bearingOnly.length)
    for (const hit of both) {
      expect(Math.abs(hit.altitude - 10)).toBeLessThan(1.05)
      expect(Math.abs(signedBearingDelta(hit.azimuth, 254.1))).toBeLessThan(1.05)
    }
  })
})

describe('pointing at a thing instead of naming a bearing', () => {
  it('is the same answer as the bearing to that thing', () => {
    /* A point due west-southwest of the pin. */
    const target = { lat: 36.6, lon: -76.3 }
    const bearing = bearingBetween(SANDBRIDGE, target)

    const byPoint = sunBehindTimes({
      at: SANDBRIDGE,
      target,
      bearingTo: bearingBetween,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-18T00:00:00Z'),
      bearingToleranceDeg: 1,
    })
    const byBearing = sunAimTimes({
      at: SANDBRIDGE,
      from: day('2026-10-15T00:00:00Z'),
      to: day('2026-10-18T00:00:00Z'),
      bearing,
      bearingToleranceDeg: 1,
    })

    expect(byPoint.length).toBeGreaterThan(0)
    expect(byPoint.map((h) => h.at.getTime())).toEqual(byBearing.map((h) => h.at.getTime()))
  })
})

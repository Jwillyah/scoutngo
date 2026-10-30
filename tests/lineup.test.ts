import { readFileSync } from 'node:fs'
import { getMoonIllumination, getMoonPosition, getMoonTimes, getPosition, getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { findAlignments, HORIZON_ALTITUDE } from '../src/core/alignment.ts'
import { moonPosition2, sunPosition2 } from '../src/core/ephemeris2.ts'
import { destinationPoint } from '../src/core/geo.ts'
import { centreFor, findLineups, lineupLine, LINEUP_TOLERANCE_DEG, sightOf } from '../src/core/lineup.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const PIER_END = { lat: 36.8432, lon: -75.9676 }
const delta = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

describe('rise and set mean what suncalc means (29 Oct: they were 2.5 minutes off)', () => {
  it('an alignment aimed at the sunrise point finds suncalc’s sunrise, to the second', () => {
    for (const day of ['2026-11-04', '2027-03-20', '2027-06-21']) {
      const rise = getTimes(new Date(`${day}T12:00:00Z`), PIER.lat, PIER.lon).sunrise as Date
      const target = destinationPoint(PIER, getPosition(rise, PIER.lat, PIER.lon).azimuth, 2000)
      const [a] = findAlignments({ observer: PIER, target, body: 'sun', mode: 'rise', from: new Date(rise.getTime() - 6 * 3_600_000), to: new Date(rise.getTime() + 6 * 3_600_000) })
      expect(Math.abs(a.at.getTime() - rise.getTime())).toBeLessThan(5_000)
    }
  })

  it('and at the moonrise point, suncalc’s moonrise, to a few seconds', () => {
    const rise = getMoonTimes(new Date('2026-11-04T12:00:00Z'), PIER.lat, PIER.lon).rise as Date
    const target = destinationPoint(PIER, getMoonPosition(rise, PIER.lat, PIER.lon).azimuth, 2000)
    const [a] = findAlignments({ observer: PIER, target, body: 'moon', mode: 'rise', from: new Date(rise.getTime() - 6 * 3_600_000), to: new Date(rise.getTime() + 6 * 3_600_000) })
    expect(Math.abs(a.at.getTime() - rise.getTime())).toBeLessThan(15_000)
  })

  it('carries the same convention up to a terrain horizon', () => {
    expect(centreFor('sun', 0)).toBe(HORIZON_ALTITUDE.sun)
    expect(centreFor('sun', 1.5)).toBeCloseTo(HORIZON_ALTITUDE.sun + 1.5, 9)
  })
})

describe('a second ephemeris agrees on the bearing', () => {
  it('Meeus’s sun within 0.02° of suncalc’s azimuth, and his moon within 0.25°, over a year', () => {
    let sun = 0
    let moon = 0
    for (let i = 0; i < 2000; i += 1) {
      const t = new Date(Date.UTC(2026, 9, 30) + i * 4.38 * 3_600_000)
      const a = getPosition(t, PIER.lat, PIER.lon)
      if (a.altitude > 2) sun = Math.max(sun, delta(a.azimuth, sunPosition2(t, PIER.lat, PIER.lon).azimuth))
      const m = getMoonPosition(t, PIER.lat, PIER.lon)
      if (m.altitude > 2) moon = Math.max(moon, delta(m.azimuth, moonPosition2(t, PIER.lat, PIER.lon).azimuth))
    }
    expect(sun).toBeLessThan(0.02)
    expect(moon).toBeLessThan(0.25)
  })
})

/*
 * ONE ALIGNMENT CHECKED BY HAND, against NASA JPL Horizons (DE441), asked for
 * the moon from the pier at the full moonrise the finder gives off the pier's
 * end in September 2027 (tests/data/horizons-moon-2027-09-14.txt).
 */
describe('the full moon off the pier end, 14 Sep 2027, against JPL Horizons', () => {
  const rows = [...readFileSync('tests/data/horizons-moon-2027-09-14.txt', 'utf8').matchAll(/^ (\d{4})-Sep-(\d{2}) (\d{2}):(\d{2}) \S*\s+([\d.]+)\s+(-?[\d.]+)\s+([\d.]+)/gm)].map((m) => ({
    at: new Date(Date.UTC(+m[1], 8, +m[2], +m[3], +m[4])),
    azimuth: +m[5],
    altitude: +m[6],
    lit: +m[7] / 100,
  }))

  it('reads five minutes from Horizons', () => {
    expect(rows).toHaveLength(5)
  })

  it('suncalc’s azimuth and phase agree with Horizons each minute', () => {
    for (const r of rows) {
      expect(delta(getMoonPosition(r.at, PIER.lat, PIER.lon).azimuth, r.azimuth)).toBeLessThan(0.05)
      expect(Math.abs(getMoonIllumination(r.at).fraction - r.lit)).toBeLessThan(0.005)
    }
  })

  it('the finder lists it, inside half a degree of the pier end, in words', () => {
    const found = findLineups({ observer: PIER, target: PIER_END, targetHeightM: 4, horizonDeg: 0, from: new Date('2027-09-14T00:00:00Z'), to: new Date('2027-09-16T00:00:00Z') })
    const full = found.find((l) => l.body === 'moon' && l.event === 'rise')
    expect(full).toBeDefined()
    const l = full as NonNullable<typeof full>
    expect(Math.abs(l.offset)).toBeLessThanOrEqual(LINEUP_TOLERANCE_DEG)
    /* Horizons at the found minute, interpolated: within 0.1° of the finder's bearing. */
    const before = rows.filter((r) => r.at <= l.at).at(-1)
    const after = rows.find((r) => r.at > l.at)
    if (before !== undefined && after !== undefined) {
      const f = (l.at.getTime() - before.at.getTime()) / 60_000
      expect(delta(before.azimuth + f * (after.azimuth - before.azimuth), l.azimuth)).toBeLessThan(0.1)
    }
    const when = (d: Date) => d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', day: 'numeric', month: 'short' })
    expect(lineupLine(l, 'the pier end', when)).toMatch(/^Full moon rises over the pier end · Tue, Sep 14 · 99% lit$/)
  })

  it('knows the pier end’s bearing and height from the spot', () => {
    const s = sightOf(PIER, PIER_END, 4)
    expect(s.bearing).toBeGreaterThan(95)
    expect(s.bearing).toBeLessThan(99)
    expect(s.topDeg).toBeGreaterThan(0)
  })
})

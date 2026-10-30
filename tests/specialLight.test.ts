import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  angleBetween,
  antisolar,
  bowHalfWidthDeg,
  fogRule,
  godRaysRule,
  RAINBOW_DEG,
  rainbowArc,
  rainbowRule,
  specialLine,
  windows,
} from '../src/core/specialLight.ts'
import { specialPoints } from '../src/lib/specialLightData.ts'
import { distanceMeters } from '../src/core/geo.ts'

describe('the rainbow', () => {
  it('every point of the bow is 42° from the point opposite the sun', () => {
    for (const sun of [{ azimuth: 250, altitude: 5 }, { azimuth: 100, altitude: 20 }, { azimuth: 180, altitude: 35 }]) {
      const arc = rainbowArc(sun, 1)
      expect(arc.length).toBeGreaterThan(10)
      for (const p of arc) {
        expect(angleBetween(p, antisolar(sun))).toBeCloseTo(RAINBOW_DEG, 6)
        expect(p.altitude).toBeGreaterThanOrEqual(0)
      }
      /* The top of the bow stands 42° minus the sun's height. */
      expect(Math.max(...arc.map((p) => p.altitude))).toBeCloseTo(RAINBOW_DEG - sun.altitude, 0)
    }
  })

  it('its feet on the horizon are where cos 42 = cos(sun) cos(half-width)', () => {
    const sun = { azimuth: 250, altitude: 10 }
    const half = bowHalfWidthDeg(sun.altitude) as number
    const foot = { azimuth: antisolar(sun).azimuth + half, altitude: 0 }
    expect(angleBetween(foot, antisolar(sun))).toBeCloseTo(RAINBOW_DEG, 6)
  })

  it('there is none with the sun 42° or more up, or down, or with no showers near', () => {
    expect(rainbowArc({ azimuth: 180, altitude: 45 })).toEqual([])
    expect(bowHalfWidthDeg(42)).toBeNull()
    expect(rainbowRule(30, 0.5)).toBe(true)
    expect(rainbowRule(45, 0.5)).toBe(false)
    expect(rainbowRule(-2, 0.5)).toBe(false)
    expect(rainbowRule(30, 0)).toBe(false)
    expect(rainbowRule(30, null)).toBeNull()
  })

  it('looks for showers 25 km round the venue, each point rounded to 2 decimals', () => {
    const pts = specialPoints({ lat: 36.8435575, lon: -75.9713104 })
    expect(pts).toHaveLength(9)
    for (const p of pts) {
      expect(Math.round(p.lat * 100) / 100).toBe(p.lat)
      expect(Math.round(p.lon * 100) / 100).toBe(p.lon)
    }
    expect(distanceMeters(pts[0], pts[1]) / 1000).toBeGreaterThan(23)
    expect(distanceMeters(pts[0], pts[1]) / 1000).toBeLessThan(27)
  })
})

/*
 * A REAL FOG MORNING: 9 Mar 2026 at Norfolk International (KORF), fog
 * reported 05:51-07:51, with the sea at buoy 44099 at 6.7 °C under air of
 * 60-62 °F (tests/data/fog-2026-03-09-korf.json, from the IEM ASOS archive and
 * NDBC). The rule must fire on the fog hours and not on the morning before.
 */
describe('the fog rule, replayed on 9 Mar 2026 at KORF', () => {
  const data = JSON.parse(readFileSync('tests/data/fog-2026-03-09-korf.json', 'utf8')) as {
    korf: { local: string; tempF: number; dewF: number; windKt: number | null; visMi: number; wx: string | null }[]
    buoy44099: { utc: string; waterC: number }[]
  }
  const sea = (day: string) => data.buoy44099.find((b) => b.utc.startsWith(day))?.waterC ?? null
  const rule = (o: (typeof data.korf)[number]) => fogRule({ tempF: o.tempF, dewF: o.dewF, windKt: o.windKt, seaC: sea(o.local.slice(0, 10)) })

  it('fires on the hours fog was reported, before the wind rose to 6 kt', () => {
    const fog = data.korf.filter((o) => o.wx === 'FG')
    expect(fog.map((o) => o.local)).toEqual(['2026-03-09 05:51', '2026-03-09 06:51', '2026-03-09 07:51'])
    expect(rule(fog[0])).toBe(true)
    expect(rule(fog[1])).toBe(true)
    /* 07:51 had the wind at 6 kt: at the rule's edge, and said honestly as not firing. */
    expect(rule(fog[2])).toBe(false)
  })

  it('does not fire the morning before, with a 4 °F spread and 15 kt', () => {
    const before = data.korf.filter((o) => o.local.startsWith('2026-03-08'))
    expect(before.length).toBeGreaterThan(3)
    expect(before.every((o) => rule(o) === false)).toBe(true)
  })

  it('is a rule, not a forecast: it also fired on 10 Mar, when no fog came', () => {
    /* Recorded so the list's "possible" is read as possible: 55/55 °F, 5 kt, sea 6.7 °C, visibility 8-10 miles. */
    const next = data.korf.find((o) => o.local === '2026-03-10 05:51')
    expect(next !== undefined && rule(next)).toBe(true)
    expect(next?.wx).toBeNull()
  })

  it('cannot say without a number, and says so', () => {
    expect(fogRule({ tempF: null, dewF: 50, windKt: 2, seaC: null })).toBeNull()
  })
})

describe('the list', () => {
  const h = (n: number) => new Date(Date.UTC(2026, 9, 30, n))
  const hours = [h(9), h(10), h(11), h(12), h(13)]

  it('joins hours into windows and counts the models that agree', () => {
    const w = windows('fog', hours, [[false, true, true, false, false], [false, true, false, false, false], [null, true, true, false, false]], () => 'why')
    expect(w).toHaveLength(1)
    expect(w[0].from).toEqual(h(10))
    expect(w[0].to).toEqual(h(12))
    expect([w[0].agree, w[0].of, w[0].word]).toEqual([3, 3, 'likely'])
    expect(windows('fog', hours, [[false, true, false, false, false], [false, false, false, false, false], [false, false, false, false, false]], () => '')[0].word).toBe('possible')
  })

  it('says possible or likely, never more', () => {
    const w = windows('rays', hours, [[true, true, true, true, true]], () => '')
    expect(specialLine(w[0], () => '5–10 AM')).toBe('God rays likely 5–10 AM')
    expect(godRaysRule(10, 50)).toBe(true)
    expect(godRaysRule(10, 95)).toBe(false)
    expect(godRaysRule(40, 50)).toBe(false)
  })
})

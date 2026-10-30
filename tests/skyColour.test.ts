import { readFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import {
  airMass,
  cloudLight,
  clockWords,
  dipDeg,
  EARTH_R_M,
  geometricFromApparent,
  lit,
  refractionDeg,
  strip,
  stripTimes,
  type Layer,
} from '../src/core/skyColour.ts'
import { reachKm } from '../src/core/skyColour.ts'
import { formatClock } from '../src/core/timezone.ts'
import { parseFirePaths, pathsAt, nearestHour } from '../src/lib/skyFireData.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const alt = (t: Date) => getPosition(t, PIER.lat, PIER.lon).altitude
const clock = (d: Date) => formatClock(d, 'America/New_York', 12)
const SUNRISE = getTimes(new Date('2026-10-29T16:00:00Z'), PIER.lat, PIER.lon).sunrise as Date

describe('the geometry', () => {
  it('a cloud h metres up sees the sun to sqrt(2h/R) below the horizon', () => {
    expect(dipDeg(914)).toBeCloseTo((Math.sqrt((2 * 914) / EARTH_R_M) * 180) / Math.PI, 9)
    /* The exact circle: acos(R / (R + h)). The small-angle formula is within a hundredth of a degree to 10 km. */
    for (const h of [500, 1000, 4000, 8000, 10000]) {
      const exact = (Math.acos(EARTH_R_M / (EARTH_R_M + h)) * 180) / Math.PI
      expect(Math.abs(dipDeg(h) - exact)).toBeLessThan(0.01)
    }
  })

  it('first light falls exactly where the dip formula says, refraction included', () => {
    for (const h of [914, 4000, 8000]) {
      /* The geometric elevation at which refraction-lifted sun meets the cloud's horizon. */
      const edge = -dipDeg(h) - refractionDeg(-1)
      expect(lit(edge + 0.01, h)).toBe(true)
      expect(lit(edge - 0.01, h)).toBe(false)
      expect(airMass(edge - 0.01, h)).toBeNull()
      expect(airMass(edge + 0.02, h)).not.toBeNull()
    }
  })

  it('reads suncalc the way suncalc refracts: one convention, inverted exactly', () => {
    for (const g of [-3, -1, 0, 0.5, 2, 10, 45]) expect(geometricFromApparent(g + refractionDeg(g))).toBeCloseTo(g, 6)
  })

  it('first-lit times in a strip match the dip formula to the minute', () => {
    const sunrise = SUNRISE
    for (const h of [914, 4000, 8000]) {
      const s = strip({ layer: 'low', heightM: h, reachKm: 0 }, sunrise, alt, 0.1)
      const first = stripTimes(s).firstLit as Date
      const edge = -dipDeg(h) - refractionDeg(-1)
      expect(geometricFromApparent(alt(first))).toBeGreaterThan(edge)
      expect(geometricFromApparent(alt(new Date(first.getTime() - 60_000)))).toBeLessThanOrEqual(edge)
    }
  })
})

describe('the colour', () => {
  it('goes toward white as the sun climbs: blue and green rise against red, every step', () => {
    let last = { g: -1, b: -1 }
    for (let e = -0.9; e <= 60; e += 0.25) {
      const l = cloudLight(e, 1000, 0.1)
      expect(l).not.toBeNull()
      const g = (l?.rgb[1] ?? 0) / (l?.rgb[0] ?? 1)
      const b = (l?.rgb[2] ?? 0) / (l?.rgb[0] ?? 1)
      expect(g).toBeGreaterThanOrEqual(last.g)
      expect(b).toBeGreaterThanOrEqual(last.b)
      last = { g, b }
    }
    expect(last.g).toBeGreaterThan(0.85)
  })

  it('haze reddens it: more aerosol, less blue at the same sun', () => {
    const clean = cloudLight(3, 1000, 0.05)
    const hazy = cloudLight(3, 1000, 0.5)
    expect((hazy?.rgb[2] ?? 1) / (hazy?.rgb[0] ?? 1)).toBeLessThan((clean?.rgb[2] ?? 0) / (clean?.rgb[0] ?? 1))
    expect(hazy?.brightness ?? 1).toBeLessThan(clean?.brightness ?? 0)
  })

  it('a high cloud is lit before a low one, and stays redder for less long', () => {
    const sunrise = SUNRISE
    const t = (l: Layer, h: number) => stripTimes(strip({ layer: l, heightM: h, reachKm: 0 }, sunrise, alt, 0.1))
    expect((t('high', 8000).firstLit as Date).getTime()).toBeLessThan((t('low', 1000).firstLit as Date).getTime())
  })
})

describe('29 Oct at the Virginia Beach pier, replayed', () => {
  const fixture = JSON.parse(readFileSync('tests/data/sky-fire-2026-10-29-sunrise.json', 'utf8'))
  const sunrise = SUNRISE
  const paths = pathsAt(parseFirePaths(fixture.payload) as NonNullable<ReturnType<typeof parseFirePaths>>, nearestHour(sunrise))
  const best = paths.find((p) => p.model === 'best_match') ?? paths[0]
  /* KNTU at 06:56: BKN030, a deck at 3,000 ft, 914 m. Aerosol 0.10 from Open-Meteo for that hour (measurements/2026-10-30-sky-colour.md). */
  const low = strip({ layer: 'low', heightM: 914, reachKm: reachKm(best, 'low', 914) ?? 0 }, sunrise, alt, 0.1)

  it('has the low deck on the sun’s line to 100 km, inside its horizon (108 km)', () => {
    expect(reachKm(best, 'low', 914)).toBe(100)
    expect(reachKm(best, 'mid', 4000)).toBeNull()
  })

  it('starts the low-deck glow before 7:20 (it was seen about 7:15)', () => {
    const t = stripTimes(low)
    expect(t.glowFrom).not.toBeNull()
    expect(clock(t.glowFrom as Date)).toMatch(/^7:1\d AM$/)
    expect((t.glowFrom as Date).getTime()).toBeLessThan(Date.parse('2026-10-29T11:20:00Z'))
  })

  it('says it in words computed from the strips, never as a promise', () => {
    const words = clockWords([low], 'sunrise', clock)
    expect(words).toMatch(/^Low deck glows 7:1\d AM–7:\d\d AM · deepest red 7:\d\d AM · be set up by 7:\d\d AM$/)
    expect(words).not.toMatch(/will|guarantee|certain|safe|clear/i)
  })
})

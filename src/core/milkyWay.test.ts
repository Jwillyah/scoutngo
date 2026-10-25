import { getMoonIllumination } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { GALACTIC_CORE, localSiderealTime } from './celestial.ts'
import { corePosition, hoursMinutes, localNoon, milkyWayNight, rankNights } from './milkyWay.ts'

/* Brew River Dock Bar, Salisbury MD: 38 N, where the core is a summer object. */
const LAT = 38.364236
const LON = -75.605912
const TZ = 'America/New_York'

describe('where the core is', () => {
  /*
   * THE INDEPENDENT CHECK. A fixed star culminates when its hour angle is zero
   * (local sidereal time equal to its right ascension), at altitude
   * 90 - |latitude - declination|. That closed form shares nothing with the
   * spherical-trig conversion under test except the inputs, so a sign error or
   * a wrong sidereal time cannot pass both.
   */
  it('culminates at 90 - |lat - dec|, when local sidereal time equals its RA', () => {
    const start = new Date('2026-07-15T00:00:00Z').getTime()
    let best = { alt: -90, at: start }
    for (let t = start; t < start + 86_400_000; t += 60_000) {
      const alt = corePosition(new Date(t), LAT, LON).altitude
      if (alt > best.alt) best = { alt, at: t }
    }
    expect(best.alt).toBeCloseTo(90 - Math.abs(LAT - GALACTIC_CORE.dec), 1)
    const hourAngle = ((localSiderealTime(new Date(best.at), LON) - GALACTIC_CORE.ra + 540) % 360) - 180
    expect(Math.abs(hourAngle)).toBeLessThan(0.5)
  })

  it('culminates due south from the northern hemisphere', () => {
    const start = new Date('2026-07-15T00:00:00Z').getTime()
    let best = { alt: -90, az: 0 }
    for (let t = start; t < start + 86_400_000; t += 60_000) {
      const p = corePosition(new Date(t), LAT, LON)
      if (p.altitude > best.alt) best = { alt: p.altitude, az: p.azimuth }
    }
    expect(Math.abs(best.az - 180)).toBeLessThan(1)
  })
})

describe('a night', () => {
  it('in December at 38 N has no shoot window: the core is down after dark', () => {
    const night = milkyWayNight('2026-12-15', LAT, LON, TZ)
    expect(night.dark).not.toBeNull()
    expect(night.shootMinutes).toBe(0)
    expect(night.score).toBe(0)
    expect(night.reason).toMatch(/below the horizon/)
  })

  it('in summer scores lower at full moon than at new moon', () => {
    /* The fullest and the darkest moon among July and August 2026 evenings. */
    const dates = Array.from({ length: 62 }, (_, i) =>
      new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
    )
    const lit = (d: string) => getMoonIllumination(new Date(localNoon(d, TZ).getTime() + 12 * 3_600_000)).fraction
    const full = dates.reduce((a, b) => (lit(b) > lit(a) ? b : a))
    const fresh = dates.reduce((a, b) => (lit(b) < lit(a) ? b : a))
    expect(lit(full)).toBeGreaterThan(0.9)
    expect(lit(fresh)).toBeLessThan(0.1)
    const fullNight = milkyWayNight(full, LAT, LON, TZ)
    const newNight = milkyWayNight(fresh, LAT, LON, TZ)
    expect(newNight.shootMinutes).toBeGreaterThan(0)
    expect(fullNight.score).toBeLessThan(newNight.score)
  })

  it('a new-moon summer night says why, in words, with no dash', () => {
    const night = milkyWayNight('2026-08-12', LAT, LON, TZ)
    expect(night.reason).toMatch(/of dark sky with the core up to \d+ degrees/)
    expect(night.reason).not.toMatch(/—/)
    expect(night.window).not.toBeNull()
    /* The window is inside the dark. */
    expect(night.window!.from.getTime()).toBeGreaterThanOrEqual(night.dark!.from.getTime())
    expect(night.window!.to.getTime()).toBeLessThanOrEqual(night.dark!.to.getTime())
  })

  it('far north in June never gets fully dark, and says so', () => {
    const night = milkyWayNight('2026-06-21', 60, 10, 'Europe/Oslo')
    expect(night.dark).toBeNull()
    expect(night.reason).toMatch(/never gets fully dark/)
  })
})

describe('ranking 30 nights', () => {
  const ranked = rankNights(LAT, LON, new Date('2026-07-01T16:00:00Z'), 30, TZ)
  it('returns every night, best first', () => {
    expect(ranked).toHaveLength(30)
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
  })
  it('scores stay in 0 to 100 and every night has a reason', () => {
    for (const night of ranked) {
      expect(night.score).toBeGreaterThanOrEqual(0)
      expect(night.score).toBeLessThanOrEqual(100)
      expect(night.reason.length).toBeGreaterThan(10)
    }
  })
})

describe('hours and minutes', () => {
  it('reads as h and m, never as a pile of minutes', () => {
    expect(hoursMinutes(250)).toBe('4 h 10 m')
    expect(hoursMinutes(240)).toBe('4 h')
    expect(hoursMinutes(50)).toBe('50 m')
  })
})

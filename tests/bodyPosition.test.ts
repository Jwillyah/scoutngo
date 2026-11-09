import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getTimes } from 'suncalc'
import { bodyPosition } from '../src/core/sun.ts'
import { moonTimesOnLocalDay } from '../src/core/moonTimes.ts'
import { compass } from '../src/lib/tideWords.ts'

/*
 * E10: the home's Moon card said the moon rose in the "S" at 6:00 AM on
 * 8 Nov 2026 at Virginia Beach. suncalc 2.0.2 already returns a north-based
 * compass bearing in degrees; Home applied the old radians-from-south
 * conversion on top (113 -> 6651, which reads as S). One conversion now,
 * src/core/sun.ts bodyPosition, for the sun and the moon.
 */
const VB_PIER = { lat: 36.8413, lon: -75.9716 }
const TZ = 'America/New_York'

describe('bodyPosition', () => {
  it('puts the 8 Nov 2026 moonrise at Virginia Beach in the east, ESE', () => {
    const rise = moonTimesOnLocalDay(new Date('2026-11-08T17:00:00Z'), VB_PIER.lat, VB_PIER.lon, TZ).rise
    expect(rise).not.toBeNull()
    /* 6:00 AM EST on 8 Nov is 11:00 UTC. */
    expect(Math.abs((rise as Date).getTime() - Date.parse('2026-11-08T11:00:00Z'))).toBeLessThan(5 * 60_000)
    const p = bodyPosition('moon', rise as Date, VB_PIER.lat, VB_PIER.lon)
    expect(p.azimuth).toBeGreaterThan(90)
    expect(p.azimuth).toBeLessThan(135)
    expect(compass(p.azimuth)).toBe('ESE')
    /* At its rise the moon is at the horizon, not 57 times anything. */
    expect(Math.abs(p.altitude)).toBeLessThan(1)
  })

  it('puts every moonrise in the east half and every sunset in the west half, 1-30 Nov 2026', () => {
    let rises = 0
    for (let d = 1; d <= 30; d++) {
      const day = new Date(Date.UTC(2026, 10, d, 17))
      const rise = moonTimesOnLocalDay(day, VB_PIER.lat, VB_PIER.lon, TZ).rise
      if (rise !== null) {
        rises++
        const az = bodyPosition('moon', rise, VB_PIER.lat, VB_PIER.lon).azimuth
        expect(az).toBeGreaterThan(0)
        expect(az).toBeLessThan(180)
      }
      const set = getTimes(day, VB_PIER.lat, VB_PIER.lon).sunset as Date
      const az = bodyPosition('sun', set, VB_PIER.lat, VB_PIER.lon).azimuth
      expect(az).toBeGreaterThan(180)
      expect(az).toBeLessThan(270)
    }
    /* The moon misses about one day a month; the loop must have looked at the rest. */
    expect(rises).toBeGreaterThanOrEqual(28)
  })

  it('puts the noon sun due south and keeps the bearing in [0, 360)', () => {
    const noon = getTimes(new Date('2026-11-02T17:00:00Z'), VB_PIER.lat, VB_PIER.lon).solarNoon
    const p = bodyPosition('sun', noon, VB_PIER.lat, VB_PIER.lon)
    expect(p.azimuth).toBeCloseTo(180, 0)
    expect(p.altitude).toBeGreaterThan(30)
    expect(p.altitude).toBeLessThan(40)
  })

  it('is the only suncalc azimuth conversion: no component or core file applies radians-from-south on top', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p)
      }
    }
    walk(join(__dirname, '..', 'src'))
    expect(files.length).toBeGreaterThan(100)
    const offenders = files.filter((f) => /(azimuth|altitude)\s*\*\s*180\)?\s*\/\s*Math\.PI/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})

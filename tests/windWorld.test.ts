import { describe, expect, it } from 'vitest'
import { blocksFor, buildField, gridStep, MAX_LAT, sampleField } from '../src/core/windViewport.ts'
import { formatDayHour } from '../src/core/timezone.ts'
import { awayDistance, awayLabel } from '../src/core/awayWords.ts'

/*
 * THE WIND MAP AT EVERY ZOOM (Batch LIVE, Section 1). 14 Nov: "Wind didn't
 * load" at world zoom (every block asked a latitude of -120°, which
 * Open-Meteo refuses whole), the field drew in the wrong place far out, the
 * bar said "3:00 PM" with no day while it played, and the map over
 * Wrightsville said "Sandbridge Beach". The live check is
 * scripts/audit-wind-live.mjs (npm run audit:wind-live).
 */
describe('world zoom', () => {
  const world = { south: -80, west: -260, north: 82, east: 110 }
  it('no block asks a latitude past 85°, and every block asks something', () => {
    for (const z of [0, 1, 2, 3, 4]) {
      const step = gridStep(world, z)
      const blocks = blocksFor(world, step)
      expect(blocks.length).toBeGreaterThan(0)
      for (const b of blocks) {
        expect(b.points.length).toBeGreaterThan(0)
        for (const p of b.points) {
          expect(Math.abs(p.lat)).toBeLessThanOrEqual(MAX_LAT)
          expect(Math.abs(p.lon)).toBeLessThanOrEqual(180)
        }
      }
    }
  })
  it('a world copy reads the same place: -75.93 and 284.07 and -435.93 are one longitude', () => {
    const pts = []
    for (let lat = 30; lat <= 40; lat += 5) for (let lon = -80; lon <= -70; lon += 5) pts.push({ lat, lon, u: lon, v: lat, gust: null })
    const f = buildField(pts, 5)!
    const a = sampleField(f, 36.85, -75.93)
    expect(sampleField(f, 36.85, 284.07)).toEqual(a)
    expect(sampleField(f, 36.85, -435.93)).toEqual(a)
  })
})

describe('the bar says the day while it plays', () => {
  it('"Sat 3 PM", "Sat 3:30 PM"', () => {
    expect(formatDayHour(new Date('2026-11-14T20:00:00Z'), 'America/New_York', 12)).toBe('Sat 3 PM')
    expect(formatDayHour(new Date('2026-11-14T20:30:00Z'), 'America/New_York', 12)).toBe('Sat 3:30 PM')
  })
})

describe('a banner about a place off screen says how far', () => {
  const sandbridge = { lat: 36.72, lon: -75.93 }
  const wrightsville = { south: 34.1, west: -77.9, north: 34.3, east: -77.7 }
  it('over Wrightsville, "Sandbridge · 18x mi"', () => {
    expect(awayDistance(sandbridge, wrightsville, true)).toMatch(/^\d+ mi$/)
    expect(awayLabel('Sandbridge Beach', sandbridge, wrightsville, true)).toMatch(/^Sandbridge · \d+ mi$/)
  })
  it('on the spot, just its name', () => {
    expect(awayLabel('Sandbridge Beach', sandbridge, { south: 36.6, west: -76.1, north: 36.8, east: -75.8 }, true)).toBe('Sandbridge Beach')
    /* Zoomed out to the world with the spot on screen: no distance, wherever the bounds' middle falls. */
    expect(awayLabel('Sandbridge Beach', sandbridge, { south: -70, west: -200, north: 80, east: 40 }, true)).toBe('Sandbridge Beach')
    expect(awayLabel('Sandbridge Beach', sandbridge, null, true)).toBe('Sandbridge Beach')
  })
})

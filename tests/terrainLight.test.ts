import { describe, expect, it } from 'vitest'
import { getPosition } from 'suncalc'
import { alpenglow, ALPENGLOW_BELOW_DEG, skylineSun } from '../src/core/terrainLight.ts'

/*
 * LAND › TERRAIN LIGHT (src/core/terrainLight.ts), at Big Meadow in
 * Shenandoah on 30 Oct 2026. A skyline 5° high to the east must hold the
 * sunrise back by tens of minutes; a flat one must agree with suncalc's.
 */
const BIG_MEADOW = { lat: 38.5246, lon: -78.4405 }
const DAY = new Date('2026-10-30T16:00:00Z')
const ridgeEast = { kind: 'terrain' as const, samples: Array.from({ length: 24 }, (_, i) => ({ azimuth: i * 15, angleDegrees: i * 15 >= 60 && i * 15 <= 150 ? 5 : 0 })) }
const min = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 60_000

describe('the sun against the skyline', () => {
  it('a flat horizon gives suncalc’s sunrise and sunset, to a few minutes', () => {
    const s = skylineSun(DAY, BIG_MEADOW.lat, BIG_MEADOW.lon, { kind: 'flat' })
    expect(s.flatRise).not.toBeNull()
    expect(Math.abs(min(s.ridgeRise!, s.flatRise!))).toBeLessThan(6)
    expect(Math.abs(min(s.ridgeSet!, s.flatSet!))).toBeLessThan(6)
  })

  it('a ridge 5° high to the east holds the sunrise back, and leaves the sunset alone', () => {
    const s = skylineSun(DAY, BIG_MEADOW.lat, BIG_MEADOW.lon, ridgeEast)
    const late = min(s.ridgeRise!, s.flatRise!)
    /* About 5° / (15°/h × cos 38.5° × sin of the sun's path angle): over 20 minutes, under an hour. */
    expect(late).toBeGreaterThan(20)
    expect(late).toBeLessThan(60)
    /* At that minute the sun is just over the ridge's 5°. */
    const a = getPosition(s.ridgeRise!, BIG_MEADOW.lat, BIG_MEADOW.lon).altitude
    expect(a).toBeGreaterThan(5)
    expect(a).toBeLessThan(5.4)
    expect(Math.abs(min(s.ridgeSet!, s.flatSet!))).toBeLessThan(6)
  })

  it('a wall the sun never clears says so: no time, not a guess', () => {
    const wall = { kind: 'terrain' as const, samples: Array.from({ length: 24 }, (_, i) => ({ azimuth: i * 15, angleDegrees: 80 })) }
    const s = skylineSun(DAY, BIG_MEADOW.lat, BIG_MEADOW.lon, wall)
    expect(s.ridgeRise).toBeNull()
    expect(s.ridgeSet).toBeNull()
  })
})

describe('the alpenglow window', () => {
  it('is the minutes the sun is 0° to 4° below the level horizon, after sunset and before sunrise', () => {
    const { morning, evening } = alpenglow(DAY, BIG_MEADOW.lat, BIG_MEADOW.lon)
    for (const span of [morning, evening]) {
      expect(span).not.toBeNull()
      const length = min(span!.to, span!.from)
      /* 4° at about 11°/h of descent here in late October: about 20 minutes. */
      expect(length).toBeGreaterThan(15)
      expect(length).toBeLessThan(30)
      for (const t of [span!.from, span!.to]) {
        const a = getPosition(t, BIG_MEADOW.lat, BIG_MEADOW.lon).altitude
        expect(a).toBeLessThanOrEqual(0)
        expect(a).toBeGreaterThanOrEqual(-ALPENGLOW_BELOW_DEG)
      }
    }
    expect(evening!.from.getTime()).toBeGreaterThan(morning!.to.getTime())
  })
})

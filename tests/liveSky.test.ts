import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { liveSkyOf, LIVE_SKY_STATES, STAR_MAX, type LiveSkyIn } from '../src/core/liveSky.ts'

/*
 * THE LIVE SKY (Batch LIVE, Section 7): eight states from the sky word's own
 * inputs; stars by the clear share and the darkness; the moon where it is;
 * drawn in code, under 30 KB all told, no photos.
 */
const base: LiveSkyIn = { sunDeg: 40, code: 0, cover: { low: 0, mid: 0, high: 0 }, word: 'Clear', moon: null }
const state = (o: Partial<LiveSkyIn>) => liveSkyOf({ ...base, ...o }).state

describe('eight states', () => {
  it('each from its inputs', () => {
    expect(state({})).toBe('clear-day')
    expect(state({ cover: { low: 45, mid: 10, high: 0 }, word: 'Partly cloudy' })).toBe('cloudy')
    expect(state({ word: 'Overcast', code: 3 })).toBe('overcast')
    expect(state({ code: 63, cover: { low: 90, mid: 80, high: 0 }, word: null })).toBe('rain')
    expect(state({ code: 45, word: 'Fog' })).toBe('fog')
    expect(state({ sunDeg: 4 })).toBe('golden')
    expect(state({ sunDeg: -25 })).toBe('night-clear')
    expect(state({ sunDeg: -25, word: 'Mostly cloudy', cover: { low: 80, mid: 0, high: 0 } })).toBe('night-cloudy')
    expect(LIVE_SKY_STATES).toHaveLength(8)
  })
  it('the sky word wins: the station\'s "Mostly cloudy" over a model\'s clear layers', () => {
    expect(state({ word: 'Mostly cloudy', cover: { low: 0, mid: 0, high: 0 } })).toBe('cloudy')
  })
  it('clouds as many as the cover', () => {
    expect(liveSkyOf({ ...base, cover: { low: 30, mid: 0, high: 0 }, word: 'Partly cloudy' }).clouds).toBeLessThan(liveSkyOf({ ...base, cover: { low: 75, mid: 0, high: 0 }, word: 'Mostly cloudy' }).clouds)
  })
})

describe('the night', () => {
  it('stars: the clear share times the darkness; a bright moon up takes some', () => {
    expect(liveSkyOf({ ...base, sunDeg: -30 }).stars).toBe(STAR_MAX)
    expect(liveSkyOf({ ...base, sunDeg: -9 }).stars).toBeLessThan(STAR_MAX / 2)
    const moonUp = liveSkyOf({ ...base, sunDeg: -30, moon: { alt: 40, az: 180, fraction: 1, waxing: false } })
    expect(moonUp.stars).toBeLessThan(STAR_MAX)
    expect(liveSkyOf({ ...base, sunDeg: -30, word: 'Mostly cloudy', cover: { low: 80, mid: 0, high: 0 } }).stars).toBe(0)
  })
  it('the moon where it is: east on the left, higher up the page when higher', () => {
    const east = liveSkyOf({ ...base, sunDeg: -30, moon: { alt: 20, az: 100, fraction: 0.5, waxing: true } }).moon!
    const west = liveSkyOf({ ...base, sunDeg: -30, moon: { alt: 60, az: 260, fraction: 0.5, waxing: true } }).moon!
    expect(east.x).toBeLessThan(0.5)
    expect(west.x).toBeGreaterThan(0.5)
    expect(west.y).toBeLessThan(east.y)
    /* In the band above the cards, never behind their words. */
    expect(east.y).toBeLessThanOrEqual(0.1)
    expect(liveSkyOf({ ...base, sunDeg: -30, moon: { alt: -5, az: 100, fraction: 0.5, waxing: true } }).moon).toBeNull()
  })
})

describe('drawn in code', () => {
  const files = ['src/core/liveSky.ts', 'src/components/LiveSky.tsx', 'src/lib/useLiveSky.ts', 'src/lib/liveSkySetting.ts', 'src/styles/live-sky.css']
  it('under 30 KB all told, no photos, a drift that stops under Reduce Motion, home only by default', () => {
    expect(files.reduce((n, f) => n + statSync(f).size, 0)).toBeLessThanOrEqual(30 * 1024)
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/\.(jpe?g|png|webp)\b|<img/)
    expect(readFileSync('src/styles/live-sky.css', 'utf8')).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.lsky__drift\s*\{\s*animation: none/)
    expect(readFileSync('src/lib/liveSkySetting.ts', 'utf8')).toMatch(/return v === 'all' \|\| v === 'off' \? v : 'home'/)
  })
})

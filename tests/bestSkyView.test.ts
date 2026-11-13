import { describe, expect, it } from 'vitest'
import { RADII_MI, type ScoredPoint } from '../src/core/bestSky.ts'
import { AREA_TILE_CAP, areaTiles, areaView, ringPx, washSpots } from '../src/core/bestSkyView.ts'
import { clockSpan, radiusWords } from '../src/core/bestSkyWords.ts'
import { inView } from '../src/core/tileView.ts'

/* WHERE'S THE COLOR? PAGE 1, THE MAP (Batch BEST SKY, Section 3; board BestSky_Map). */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const point = (lat: number, lon: number, score: number, blocked = false): ScoredPoint => ({ lat, lon, sunScore: score, sunWhy: [], glow: 0, glowFires: false, belt: false, canvas: score, overhead: score, gap: 1, blocked, score, word: score >= 0.5 ? 'Likely' : score >= 0.25 ? 'Possible' : 'Little', why: [] })

describe('the area as a map', () => {
  it('every radius: the ring inside the box, you in it, at most 16 imagery tiles', () => {
    for (const r of RADII_MI) {
      const v = areaView(PIER, r)
      const you = inView(v, PIER)
      const ring = ringPx(v, PIER, r)
      expect(ring).toBeGreaterThan(100)
      expect(you.x - ring).toBeGreaterThanOrEqual(0)
      expect(you.x + ring).toBeLessThanOrEqual(v.width)
      expect(you.y - ring).toBeGreaterThanOrEqual(0)
      expect(you.y + ring).toBeLessThanOrEqual(v.height)
      expect(areaTiles(v).length).toBeGreaterThan(0)
      expect(areaTiles(v).length).toBeLessThanOrEqual(AREA_TILE_CAP)
    }
  })
  it('the wash: a spot on every point that scores Possible or better, none where the sky is clear or blocked', () => {
    const v = areaView(PIER, 15)
    const grid = [point(36.85, -76.1, 1), point(36.85, -76.05, 0.3), point(36.85, -76, 0.1), point(36.85, -75.95, 0.9, true)]
    const w = washSpots(v, grid)
    expect(w).toHaveLength(2)
    expect(w[0].o).toBeGreaterThan(w[1].o)
    expect(washSpots(v, [point(36.85, -76.1, 0), point(36.85, -76.05, 0.1)])).toHaveLength(0)
  })
  it('its words: the radius in the person\'s units; a window with each end\'s AM or PM', () => {
    expect(radiusWords(15, true)).toBe('15 mi')
    expect(radiusWords(15, false)).toBe('24 km')
    expect(clockSpan(new Date('2026-11-11T21:51:00Z'), new Date('2026-11-11T22:13:00Z'), 'America/New_York')).toBe('4:51 PM–5:13 PM')
  })
})

import { describe, expect, it } from 'vitest'
import { bestView, bestViewOnMap, nearestShore, openness, rankSpots, waterShare } from '../src/core/bestView.ts'

/*
 * BEST FIRE NEAR ME (Batch J, Section 5), on a made coast: a bay to the
 * west of -76.12, the ocean east of -75.98, land between. The 2 Nov sunset
 * is at 252°, WSW: a bayside spot looks over water into the lit wedge, the
 * oceanfront faces the other way and sees the afterglow only.
 */
const sea = (p: { lat: number; lon: number }) => p.lon < -76.12 || p.lon > -75.98
const VENUE = { lat: 36.85, lon: -76.05 }
const SPOTS = [
  { name: 'Oceanfront', at: { lat: 36.85, lon: -75.985 }, facing: 100 },
  { name: 'Bayside, the pier', at: { lat: 36.86, lon: -76.115 }, facing: 270 },
  { name: 'Town Center', at: { lat: 36.84, lon: -76.05 }, facing: null },
]

describe('best view', () => {
  it('measures the water in the wedge toward the sun', () => {
    expect(waterShare(SPOTS[1].at, 252, sea)).toBeGreaterThan(0.9)
    expect(waterShare(SPOTS[0].at, 252, sea)).toBe(0)
    expect(openness(0.7)).toBe('open')
    expect(openness(0.3)).toBe('part')
    expect(openness(0.1)).toBe('land')
  })

  it('ranks the bayside first, the town on land after, the oceanfront last (faces away)', () => {
    const r = rankSpots(VENUE, 252, SPOTS, sea)
    expect(r.map((s) => s.name)).toEqual(['Bayside, the pier', 'Town Center', 'Oceanfront'])
    expect(r[2].away).toBe(true)
    expect(r[1].away).toBe(false)
  })

  it('says it in one line, never "clear"', () => {
    const v = bestView(VENUE, 252, SPOTS, sea)
    expect(v.line).toBe('Best view tonight: open WSW horizon · Bayside, drone up high. Oceanfront faces away: afterglow only.')
    expect(v.line).not.toMatch(/\bclear\b|\bsafe\b/i)
  })

  it('finds the nearest shore that looks into the wedge, when no spot does', () => {
    const shore = nearestShore(VENUE, 252, sea)
    expect(shore).not.toBeNull()
    expect(shore!.km).toBeLessThan(8)
    expect(['W', 'WSW', 'WNW', 'SW', 'NW']).toContain(shore!.toward)
    const v = bestView(VENUE, 252, [SPOTS[0]], sea)
    expect(v.line).toMatch(/^Best view tonight: open WSW horizon · a shore \d+ km W\w*, drone up high\. Oceanfront faces away: afterglow only\.$/)
  })

  it('draws the wedge and the ranked spots for the map', () => {
    const fc = bestViewOnMap(VENUE, bestView(VENUE, 252, SPOTS, sea))
    expect(fc.features[0].geometry.type).toBe('LineString')
    expect(fc.features.filter((f) => f.geometry.type === 'Point').length).toBeGreaterThanOrEqual(2)
  })
})

describe('best view, partly over water', () => {
  it('names the spots that see some water in the wedge when none is open', () => {
    /* A narrow bay: about a third of the wedge on water from the bayside spot. */
    const narrow = (p: { lat: number; lon: number }) => (p.lon < -76.12 && p.lat > 36.86) || p.lon > -75.98
    const v = bestView(VENUE, 252, SPOTS, narrow)
    expect(v.ranked[0].open).toBe('part')
    expect(v.line).toBe('Best view tonight: WSW horizon partly over water · Bayside, drone up high. Oceanfront faces away: afterglow only.')
  })
})

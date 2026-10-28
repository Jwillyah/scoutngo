import { describe, expect, it } from 'vitest'
import { regionView } from './regionView.ts'
import { COLD_START_VIEW, FRAME_VENUE_BELOW_ZOOM } from './viewport.ts'

/* Ground metres across a 390 px wide phone at a zoom: MapLibre's tiles are 512 px. */
const acrossM = (lat: number, zoom: number) => (390 * 40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)
import { distanceMeters } from './geo.ts'

describe('where the map opens with no venue yet', () => {
  it('a phone on Eastern time opens over the eastern US, not the Atlantic', () => {
    const v = regionView('America/New_York')
    expect(distanceMeters({ lat: v.center[1], lon: v.center[0] }, { lat: 36.85, lon: -75.98 })).toBeLessThan(500_000)
    expect(v.center).not.toEqual(COLD_START_VIEW.center)
  })
  it('is still a region, not a place: over 300 km across a portrait phone (twice that tall), and below the zoom that frames a venue', () => {
    for (const zone of ['America/New_York', 'America/Chicago', 'Europe/London', 'Europe/Vienna', 'Pacific/Honolulu', 'America/Puerto_Rico']) {
      const v = regionView(zone)
      expect(acrossM(v.center[1], v.zoom)).toBeGreaterThan(300_000)
      expect(v.zoom).toBeLessThan(FRAME_VENUE_BELOW_ZOOM)
    }
  })
  it('a zone it does not know, or none, opens on the old wide view', () => {
    expect(regionView('Antarctica/Troll')).toEqual({ center: COLD_START_VIEW.center, zoom: COLD_START_VIEW.zoom })
    expect(regionView(null)).toEqual({ center: COLD_START_VIEW.center, zoom: COLD_START_VIEW.zoom })
  })
  it('matches a whole zone name, not a prefix of one', () => {
    expect(regionView('America/Indiana/Indianapolis').center[0]).toBe(-86)
    expect(regionView('Europe/Vienna').zoom).toBe(3.6)
  })
})

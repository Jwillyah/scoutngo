import { describe, expect, it } from 'vitest'
import { buildingsBox, SHADOW_MARGIN_M } from '../src/core/buildingsBox.ts'

/*
 * THE SHADOWS CONTINUOUS PAST THE OLD BOX (Batch TRUTH, Section 5). At 6:59 AM
 * at the pier the shadows ran west 6x the buildings' heights; buildings were
 * fetched 0.01° round the venue only, so the shadows stopped at that box's
 * edge in hard lines. The box now covers the view and the longest shadow.
 */
const PIER = { lat: 36.8435575, lon: -75.9713104 }

describe('the buildings box', () => {
  it('covers the venue\'s own box grown by the longest shadow (600 m)', () => {
    expect(SHADOW_MARGIN_M).toBe(600)
    const b = buildingsBox(null, PIER, null)
    expect(PIER.lon - b.west).toBeGreaterThan(0.01 + 600 / (111_320 * Math.cos((PIER.lat * Math.PI) / 180)))
    expect(b.north - PIER.lat).toBeGreaterThan(0.01 + 600 / 111_320)
  })
  it('a view panned 2 km west is covered, with a shadow\'s length past its edge', () => {
    const view = { west: -76.01, east: -75.99, south: 36.83, north: 36.86 }
    const b = buildingsBox(view, PIER, null)
    expect(b.west).toBeLessThan(view.west - 600 / (111_320 * Math.cos((PIER.lat * Math.PI) / 180)))
  })
  it('a small pan inside the box asks nothing new', () => {
    const first = buildingsBox(null, PIER, null)
    const nudged = { west: PIER.lon - 0.004, east: PIER.lon + 0.004, south: PIER.lat - 0.006, north: PIER.lat + 0.006 }
    expect(buildingsBox(nudged, PIER, first)).toBe(first)
  })
})

describe('never the whole region (the locate audit hung on it)', () => {
  it('a view far from the venue, or a wide one, leaves the venue\'s box as it is', () => {
    const own = buildingsBox(null, PIER, null)
    expect(buildingsBox({ west: -75.7, east: -75.5, south: 38.3, north: 38.4 }, PIER, null)).toEqual(own)
    expect(buildingsBox({ west: -76.5, east: -75.5, south: 36.5, north: 37.2 }, PIER, null)).toEqual(own)
    const b = buildingsBox({ west: -75.99, east: -75.97, south: 36.83, north: 36.86 }, PIER, null)
    expect(b.east - b.west).toBeLessThan(0.1)
  })
})

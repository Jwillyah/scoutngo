import { describe, expect, it } from 'vitest'
import { lensFor, nextEventFor, viewfinderPreset } from '../src/core/viewfinderPreset.ts'

/* The Viewfinder opens ready: the next event and the lens for it (Batch I, Section 2). */
const BAG = [
  { id: 'sony-10-18', minFocalLength: 10, maxFocalLength: 18 },
  { id: 'sigma-28-75', minFocalLength: 28, maxFocalLength: 75 },
  { id: 'sony-70-200', minFocalLength: 70, maxFocalLength: 200 },
]
const PIER = { lat: 36.8436, lon: -75.9713 }

describe('the viewfinder preset', () => {
  it('a sunrise or sunset: 28 mm on the lens that covers it, not the ultra-wide', () => {
    expect(lensFor('sunset', BAG)).toEqual({ lensId: 'sigma-28-75', focal: 28 })
    expect(lensFor('sunrise', [BAG[0]])).toEqual({ lensId: 'sony-10-18', focal: 10 })
  })

  it('a moonrise: the longest lens at its longest', () => {
    expect(lensFor('moonrise', BAG)).toEqual({ lensId: 'sony-70-200', focal: 200 })
  })

  it('no lens in the bag: none', () => {
    expect(lensFor('sunset', [])).toEqual({ lensId: null, focal: null })
  })

  it('the next event after 2 PM EST on 2 Nov at the pier is the sunset', () => {
    const next = nextEventFor(new Date('2026-11-02T19:00:00Z'), PIER)
    expect(next?.event).toBe('sunset')
    expect(viewfinderPreset(new Date('2026-11-02T19:00:00Z'), PIER, BAG)?.lensId).toBe('sigma-28-75')
  })
})

import { describe, expect, it } from 'vitest'
import { fourSkies, weekOfSkies } from './skyPages.ts'
import type { ModelPath } from './skyFire.ts'

/* Sky fire's pages 2 and 3 (Batch F, Section 6). Fixtures only. */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const path = (model: ModelPath['model'], low: number | null, mid: number | null): ModelPath => ({ model, samples: Array.from({ length: 8 }, (_, i) => ({ low: i === 0 ? low : 5, mid: i === 0 ? mid : 10, high: 5 })) })

describe('four forecasts', () => {
  it('one sky per named model, in the board order, with its own cover over the venue', () => {
    const s = fourSkies([path('gem_seamless', 0, 5), path('best_match', 50, 50), path('gfs_hrrr', 4, 10), path('ecmwf_ifs025', 21, 35), path('icon_seamless', 63, 30)])
    expect(s.map((x) => x.model)).toEqual(['gfs_hrrr', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'])
    expect(s[2].cover).toEqual({ low: 63, mid: 30, high: 5 })
  })
  it('a model that did not answer is left out, not drawn clear', () => {
    expect(fourSkies([{ model: 'gfs_hrrr', samples: [{ low: null, mid: null, high: null }] }, path('ecmwf_ifs025', 20, 30)]).map((x) => x.model)).toEqual(['ecmwf_ifs025'])
  })
})

describe('week of skies', () => {
  it('fourteen events in order, sunrise then sunset each day, the cover at each', () => {
    const w = weekOfSkies(PIER, new Date('2026-10-30T04:00:00Z'), (at) => (at.getUTCHours() < 17 ? { low: 10, mid: 0, high: 0 } : null))
    expect(w.length).toBe(14)
    expect(w[0].kind).toBe('sunrise')
    expect(w[1].kind).toBe('sunset')
    for (let i = 1; i < w.length; i += 1) expect(w[i].at.getTime()).toBeGreaterThan(w[i - 1].at.getTime())
    expect(w[0].cover).toEqual({ low: 10, mid: 0, high: 0 })
    expect(w[1].cover).toBeNull()
    /* Sunrise toward the east, sunset toward the west. */
    expect(w[0].sunAzimuthDeg).toBeGreaterThan(90)
    expect(w[0].sunAzimuthDeg).toBeLessThan(130)
    expect(w[1].sunAzimuthDeg).toBeGreaterThan(230)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSpec } from '../api/buoy.ts'
import { nearestBuoys, type BuoyReading } from '../src/lib/buoy.ts'
import { buoyName, buoySea, buoySplit } from '../src/lib/buoyWords.ts'

/*
 * THE BUOYS SURFLINE SHOWS NEAR VIRGINIA BEACH (Batch H, Section 1.6), and
 * NDBC's spectral summaries as published on 2 Nov 2026
 * (tests/data/ndbc-2026-11-02/<id>.spec).
 */
const spec = (id: string) => readFileSync(`tests/data/ndbc-2026-11-02/${id}.spec`, 'utf8')
const PIER = { lat: 36.8436, lon: -75.9713 }

describe('which buoys', () => {
  it('from the pier, facing the ocean: Cape Henry, then the two at Duck; not Thimble Shoal in the bay', () => {
    expect(nearestBuoys(PIER, 3, 100).map((b) => b.id)).toEqual(['44099', '44100', '44056'])
  })

  it('facing the bay (a beach on the Chesapeake shore looking north), Thimble Shoal is in', () => {
    const ocean = { lat: 36.9165, lon: -76.07 } /* Ocean View, facing north into the bay */
    expect(nearestBuoys(ocean, 3, 0).map((b) => b.id)).toContain('44087')
  })

  it('never more than three, and none far inland', () => {
    expect(nearestBuoys(PIER, 3, null).length).toBeLessThanOrEqual(3)
    expect(nearestBuoys({ lat: 39.74, lon: -104.99 }, 3, null)).toEqual([])
  })
})

describe("the spectral file: the swell and the wind waves apart, only what it has", () => {
  it('44099: one swell and one wind-wave part, compass words kept', () => {
    expect(parseSpec(spec('44099'))).toEqual({
      at: '2026-11-02T16:56:00Z',
      waveM: 0.7,
      swellM: 0.1,
      swellS: 10.5,
      swellFrom: 'E',
      windWaveM: 0.7,
      windWaveS: 8.3,
      windWaveFrom: 'ESE',
      meanFromDeg: 106,
    })
  })

  it('44014: missing parts stay missing', () => {
    const r = parseSpec(spec('44014'))
    expect(r?.waveM).toBe(0.9)
    expect(r?.swellM).toBeNull()
    expect(r?.windWaveM).toBeNull()
    expect(r?.swellFrom).toBeNull()
  })

  it('says each buoy in plain parts, and no split when the file had none', () => {
    const buoy = nearestBuoys(PIER, 3, 100)[0]
    const s = parseSpec(spec('44099'))!
    const ok: BuoyReading = { status: 'ok', buoy, at: new Date(s.at), waveM: s.waveM, periodS: 8, fromDeg: 106, split: { swellM: s.swellM, swellS: s.swellS, swellFrom: s.swellFrom, windWaveM: s.windWaveM, windWaveS: s.windWaveS, windWaveFrom: s.windWaveFrom } }
    if (ok.status !== 'ok') throw new Error('ok')
    expect(buoyName(ok)).toBe('Cape Henry, VA · 44099 · 24 km')
    expect(buoySea(ok)).toBe('2.3 ft · 8 s · from ESE')
    expect(buoySplit(ok)).toBe('swell 0.3 ft 11 s E · wind waves 2.3 ft 8 s ESE')
    expect(buoySplit({ ...ok, split: null })).toBeNull()
  })
})

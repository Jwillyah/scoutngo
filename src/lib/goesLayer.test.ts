import { describe, expect, it } from 'vitest'
import { GOES_LAYER, GOES_MATRIX_SET } from '../core/goes.ts'
import { frameStamp, GIBS_WMTS, goesTileUrl, snapToFrame } from './goesLayer.ts'

/*
 * VERIFIED AGAINST THE REAL SERVICE before any of this was written. The NASA
 * GIBS capabilities lists both bands with a Time dimension at PT10M steps and
 * a months-deep archive; tiles at 09:00 and 09:10 on the same day came back
 * with different checksums, and so did the same minute a day earlier.
 *
 * THIS REPLACED THE IEM WMS, which ignores TIME: byte-identical PNGs for TIME
 * unset, for today and for yesterday, with no dimension declared anywhere in
 * its capabilities. Fine for "now", impossible for a scrub.
 */
describe('the GOES tile URL', () => {
  it('is a GIBS WMTS path against the service that was tested', () => {
    const url = goesTileUrl('infrared')
    expect(url.startsWith(GIBS_WMTS)).toBe(true)
    expect(url).toContain(GOES_LAYER.infrared)
    expect(url).toContain(GOES_MATRIX_SET.infrared)
  })

  it('asks for the matrix set each band is actually served in', () => {
    expect(goesTileUrl('visible')).toContain('GoogleMapsCompatible_Level7')
    expect(goesTileUrl('infrared')).toContain('GoogleMapsCompatible_Level6')
  })

  it('leaves maplibre placeholders literal', () => {
    const url = goesTileUrl('infrared')
    expect(url).toContain('/{z}/{y}/{x}.png')
    expect(url).not.toContain('%7B')
  })

  it('needs no key, because this is public data', () => {
    const url = goesTileUrl('infrared').toLowerCase()
    expect(url).not.toContain('key=')
    expect(url).not.toContain('token')
    expect(url).not.toContain('apikey')
  })

  it('asks for the latest frame when given no time', () => {
    expect(goesTileUrl('infrared')).toContain('/default/default/')
  })

  it('asks for a specific frame when given one', () => {
    const url = goesTileUrl('infrared', new Date('2026-10-15T09:07:33Z'))
    expect(url).toContain('/2026-10-15T09:00:00Z/')
  })
})

/*
 * FRAMES ARE SNAPPED DOWN, NOT TO THE NEAREST.
 *
 * A frame is an observation of the ten minutes BEFORE its timestamp, so
 * rounding up would label it with time it does not cover yet. The caller
 * always reports the real frame time rather than the time that was asked for.
 */
describe('snapping to a frame GIBS has', () => {
  it('floors to the ten minute step', () => {
    expect(snapToFrame(new Date('2026-10-15T09:07:33Z')).toISOString()).toBe(
      '2026-10-15T09:00:00.000Z',
    )
    expect(snapToFrame(new Date('2026-10-15T09:19:59Z')).toISOString()).toBe(
      '2026-10-15T09:10:00.000Z',
    )
  })

  it('never rounds forward past the asked-for moment', () => {
    for (const minute of [0, 1, 5, 9, 10, 11, 29, 59]) {
      const at = new Date(Date.UTC(2026, 9, 15, 9, minute, 30))
      expect(snapToFrame(at).getTime()).toBeLessThanOrEqual(at.getTime())
    }
  })

  it('is already on a frame when the time is exact', () => {
    const exact = new Date('2026-10-15T09:10:00Z')
    expect(snapToFrame(exact).getTime()).toBe(exact.getTime())
  })

  it('stamps to the second with a Z, which is what GIBS wants', () => {
    expect(frameStamp(new Date('2026-10-15T09:10:00.000Z'))).toBe('2026-10-15T09:10:00Z')
  })
})

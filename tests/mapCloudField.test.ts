import { describe, expect, it } from 'vitest'
import { cloudFieldPixels, fieldAlpha, FIELD_PX, forecastShare } from '../src/core/mapCloudField.ts'
import { GIBS_LATENCY_MS, skySourceFor } from '../src/core/skyTime.ts'

/* Batch NOW, Section 4: the map's clouds. */
const snap = (at: Date) => new Date(Math.floor(at.getTime() / 600_000) * 600_000)

describe('the empty clouds layer of 12 Nov 11:17 AM', () => {
  it('at now the layer asked for a frame 0-10 minutes old, which GIBS did not have yet; now the newest it asks is 40 minutes back', () => {
    const now = new Date('2026-11-12T16:17:00Z')
    const s = skySourceFor(now, now, snap)
    if (s.kind !== 'satellite') throw new Error('expected the satellite at now')
    expect(s.frameAt.toISOString()).toBe('2026-11-12T15:30:00.000Z')
    expect(now.getTime() - s.frameAt.getTime()).toBeGreaterThanOrEqual(GIBS_LATENCY_MS)
    /* Scrubbed an hour back, the frame is the hour's own. */
    const past = skySourceFor(new Date('2026-11-12T15:07:00Z'), now, snap)
    if (past.kind !== 'satellite') throw new Error('expected the satellite')
    expect(past.frameAt.toISOString()).toBe('2026-11-12T15:00:00.000Z')
  })
})

describe('a soft field, not squares', () => {
  it('opacity by cover: nothing under 10%, the most at 100%', () => {
    expect(fieldAlpha(5)).toBe(0)
    expect(fieldAlpha(55)).toBeGreaterThan(0)
    expect(fieldAlpha(100)).toBeGreaterThan(fieldAlpha(55))
  })
  it('between two cells the cover blends: no hard edge', () => {
    const grid = [
      [0, 100],
      [0, 100],
    ]
    const px = cloudFieldPixels(grid, FIELD_PX)
    const alphaAt = (x: number) => px[(Math.floor(FIELD_PX / 2) * FIELD_PX + x) * 4 + 3]
    const row = Array.from({ length: FIELD_PX }, (_, x) => alphaAt(x))
    for (let x = 1; x < FIELD_PX; x += 1) expect(row[x] - row[x - 1]).toBeLessThan(40)
    expect(row[0]).toBe(0)
    expect(row[FIELD_PX - 1]).toBeGreaterThan(150)
  })
  it('the last frame fades into the forecast over the first 3 hours', () => {
    expect(forecastShare(0)).toBe(0)
    expect(forecastShare(1.5)).toBe(0.5)
    expect(forecastShare(6)).toBe(1)
  })
})

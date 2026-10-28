import { describe, expect, it } from 'vitest'
import { crossings, skylineAt, skylineByBins, skylineByMarch, type SurfaceGrid } from './skyRing.ts'

/* A 400 m square of flat ground at 2 m, one 40 m block 100 m to the west, 20 m wide (north to south). */
const N = 400
const dsm = new Float32Array(N * N).fill(2)
for (let y = 190; y < 210; y += 1) for (let x = 90; x < 110; x += 1) dsm[y * N + x] = 42
const g: SurfaceGrid = { width: N, height: N, cellM: 1, dsm }
const X = 200
const Y = 200
const EYE = 2 + 1.6

describe('the skyline', () => {
  it('stands as high as the block to the west, by both ways, within 0.5 deg', () => {
    const a = skylineByMarch(g, X, Y, EYE)
    const b = skylineByBins(g, X, Y, EYE)
    /* The near face is 90 m away: atan(38.4 / 90). */
    const west = skylineAt(a, 270)
    expect(west).toBeGreaterThan(22.5)
    expect(west).toBeLessThan(23.5)
    for (let i = 0; i < 360; i += 1) expect(Math.abs(a.angle[i] - b.angle[i])).toBeLessThan(0.5)
    /* East: flat ground below the eye. */
    expect(skylineAt(a, 90)).toBeLessThan(0)
  })
  it('lowers far things by the Earth\'s curve', () => {
    const far = new Float32Array(N * N).fill(Number.NaN)
    far[200 * N + 399] = 0
    const s = skylineByMarch({ ...g, width: N, dsm: far, cellM: 10 }, 0, 200.5, 0)
    /* 3990 m: d^2 (1 - 0.13) / 2R = 1.09 m lower, about -0.016 deg. */
    expect(skylineAt(s, 90)).toBeLessThan(-0.01)
    expect(skylineAt(s, 90)).toBeGreaterThan(-0.02)
  })
  it('finds when a setting sun goes behind the block', () => {
    const s = skylineByMarch(g, X, Y, EYE)
    const path = Array.from({ length: 60 }, (_, i) => ({ at: new Date(Date.UTC(2026, 9, 28, 21, i)), azimuth: 270, altitude: 30 - i * 0.25 }))
    const c = crossings(s, path)
    expect(c).toHaveLength(1)
    expect(c[0].kind).toBe('hidden')
    /* 30 - 0.25 m = west angle, about 22.9: m about 28 minutes in. */
    const minutes = (c[0].at.getTime() - Date.UTC(2026, 9, 28, 21, 0)) / 60_000
    expect(minutes).toBeGreaterThan(26)
    expect(minutes).toBeLessThan(30)
  })
})

describe('the skyline in words', () => {
  it('says what the sun goes behind, when, and how long before sunset', async () => {
    const { skylineLines } = await import('../lib/skyline/words.ts')
    const at = new Date('2026-10-28T21:42:00Z')
    const sunset = new Date('2026-10-28T22:14:00Z')
    const lines = skylineLines([{ at, kind: 'hidden', bin: 250, body: 'sun', what: 'the Hilton' }], sunset, 'America/New_York')
    expect(lines).toEqual(['Sun drops behind the Hilton at 5:42 PM, 32 min before sunset.'])
    const none = skylineLines([], sunset, 'America/New_York')
    expect(none[0]).toBe('Nothing the scan measured stands in front of the sun today from here.')
    expect(none.join(' ')).not.toMatch(/clear|safe/i)
  })
})

describe('sunrise over open water is not "going behind" anything', () => {
  it('reports no crossing where nothing stands above level', () => {
    const flat = new Float32Array(N * N).fill(2)
    const s = skylineByMarch({ ...g, dsm: flat }, X, Y, EYE)
    const path = Array.from({ length: 30 }, (_, i) => ({ at: new Date(Date.UTC(2026, 9, 28, 11, i)), azimuth: 105, altitude: -0.8 + i * 0.2 }))
    expect(crossings(s, path)).toEqual([])
  })
})

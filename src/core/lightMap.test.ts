import { describe, expect, it } from 'vitest'
import { litByRay, sunMinutesByRays, sunMinutesBySkyline, sunSteps } from './lightMap.ts'

/* 200 m of flat ground at 0 m with a 20 m wall running north-south at x 100..104. */
const N = 200
const dsm = new Float32Array(N * N).fill(0)
for (let y = 0; y < N; y += 1) for (let x = 100; x < 105; x += 1) dsm[y * N + x] = 20
const g = { width: N, height: N, cellM: 1, dsm }

describe('the light map', () => {
  it('shades the ground on the far side of a wall from a low western sun, as far as its shadow reaches', () => {
    /* Sun due west, 20 deg up: the shadow runs east 20 / tan 20 = 55 m from the wall's east face (x 105). */
    expect(litByRay(g, 120, 100, 270, 20, 20)).toBe(false)
    expect(litByRay(g, 105 + 50, 100, 270, 20, 20)).toBe(false)
    expect(litByRay(g, 105 + 60, 100, 270, 20, 20)).toBe(true)
    /* West of the wall, facing the sun: lit. */
    expect(litByRay(g, 60, 100, 270, 20, 20)).toBe(true)
    expect(litByRay(g, 60, 100, 270, -1, 20)).toBe(false)
  })
  it('counts minutes, and the skyline way agrees with the rays', () => {
    const steps = sunSteps(new Date(0), new Date(60 * 60_000), 5, (at) => ({ azimuth: 270, altitude: 30 - at.getTime() / 60_000 / 3 }))
    expect(steps).toHaveLength(12)
    const w = { x0: 105, y0: 95, x1: 180, y1: 105 }
    const rays = sunMinutesByRays(g, w, steps)
    for (const x of [110, 130, 150, 170]) {
      const a = rays[5 * (w.x1 - w.x0) + (x - w.x0)]
      const b = sunMinutesBySkyline(g, x, 100, steps)
      expect(Math.abs(a - b)).toBeLessThanOrEqual(5)
    }
    /* Right behind the wall, all shade. */
    expect(rays[5 * (w.x1 - w.x0) + 1]).toBe(0)
    /*
     * 74 m from the wall: lit while its shadow, 20 / tan(alt), falls short,
     * so while the sun is above atan(20 / 74) = 15.1 deg, the first 44.6
     * minutes: nine five-minute steps, 45 minutes.
     */
    expect(rays[5 * (w.x1 - w.x0) + (179 - w.x0)]).toBeCloseTo(45, 6)
  })
})

describe('the light map presets', () => {
  const pier = { lat: 36.8435575, lon: -75.9713104 }
  const day = new Date('2026-10-28T04:00:00Z')
  it('golden is the last 45 min before sunset; shade is noon to sunset; even is the shoot window', async () => {
    const { presetWindow, GOLDEN_MIN } = await import('../lib/lightmap/lightMapFor.ts')
    const g = presetWindow('golden', pier, day, null)
    const s = presetWindow('shade', pier, day, null)
    expect(g !== null && (g.to.getTime() - g.from.getTime()) / 60_000).toBe(GOLDEN_MIN)
    expect(s !== null && s.to.getTime()).toBe(g?.to.getTime())
    expect(s !== null && s.from.getUTCHours()).toBe(16)
    expect(presetWindow('even', pier, day, null)).toBeNull()
    const shoot = { from: new Date('2026-10-28T20:30:00Z'), to: new Date('2026-10-28T21:30:00Z') }
    expect(presetWindow('even', pier, day, shoot)).toEqual(shoot)
  })
  it('paints sun gold and shade periwinkle, never red, and leaves what changes unmarked in Even light', async () => {
    const { cellColour } = await import('../lib/lightmap/lightMapFor.ts')
    for (const p of ['golden', 'shade', 'even'] as const) {
      for (const f of [0, 0.05, 0.3, 0.5, 0.95, 1]) {
        const c = cellColour(p, f)
        if (c !== null) expect(c[0] > 200 && c[1] < 80 && c[2] < 80).toBe(false)
      }
    }
    expect(cellColour('even', 0.5)).toBeNull()
    expect(cellColour('shade', 0.5)).toBeNull()
    expect(cellColour('shade', 0.05)?.slice(0, 3)).toEqual([154, 167, 255])
    expect(cellColour('golden', 1)?.slice(0, 3)).toEqual([255, 213, 74])
    expect(cellColour('golden', Number.NaN)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { airColumn, airRole, bestTimeBar, calmWindow, CALM_SHARE } from '../src/core/dronePage.ts'
import { kpWord, latestKp } from '../src/lib/kp.ts'

/* The Drone page (Batch Flow, Section 5; board D_Drone). */
describe('the air above the beach', () => {
  it('ground to 400 ft, each coloured against the drone limit: calm under 60%, near under it, over past it', () => {
    const rows = airColumn(2, 8, 10)
    expect(rows.map((r) => r.ft)).toEqual([400, 300, 200, 100, 0])
    expect(rows[0].mps).toBe(8)
    expect(rows[4].mps).toBe(2)
    expect(rows[0].role).toBe('near')
    expect(rows[4].role).toBe('calm')
    expect(airRole(11, 10)).toBe('over')
    expect(airRole(null, 10)).toBe('unknown')
    expect(CALM_SHARE).toBe(0.6)
  })
})

describe('the best time to fly', () => {
  const t0 = new Date('2026-11-10T09:00:00Z')
  const sun = (t: Date) => (t.getTime() - t0.getTime()) / 3_600_000 * 4 - 10
  it('dark, twilight, golden, calm, day, in that order of precedence, merged', () => {
    const segs = bestTimeBar(t0, 8, sun, () => 3, 10)
    expect(segs.map((s) => s.band)).toEqual(['dark', 'twilight', 'golden', 'calm'])
    expect(calmWindow(segs)?.band).toBe('calm')
  })
  it('no limit known: no calm window, only day', () => {
    expect(bestTimeBar(t0, 8, sun, () => 3, null).map((s) => s.band)).toEqual(['dark', 'twilight', 'golden', 'day'])
  })
})

describe('the GPS tile', () => {
  it("the latest Kp in NOAA's file; NOAA's words", () => {
    expect(latestKp([['time_tag', 'Kp'], ['2026-10-30 06:00:00.000', '2.00'], ['2026-10-30 09:00:00.000', '2.33']])).toEqual({ kp: 2.33, at: '2026-10-30 09:00:00.000' })
    expect(latestKp({})).toBeNull()
    expect(kpWord(2)).toBe('quiet')
    expect(kpWord(4)).toBe('active')
    expect(kpWord(6.3)).toBe('storm G2')
  })
})

describe('the air picture, drawn as the board (Batch Polish 2, Section 5)', () => {
  it('a streak points where the wind goes, its head at the far end', async () => {
    const { arrowPath } = await import('../src/core/dronePage.ts')
    expect(arrowPath(62, 40, true)).toBe('M62 2 q20 -5 40 -2 m-7 -4 l7 4 l-6 5')
    expect(arrowPath(62, 40, false)).toBe('M102 2 q-20 -5 -40 -2 m7 -4 l-7 4 l6 5')
  })
  it('stars only after civil dusk, inside the picture', async () => {
    const { starsOut, NIGHT_STARS } = await import('../src/core/dronePage.ts')
    expect(starsOut(-7)).toBe(true)
    expect(starsOut(-5)).toBe(false)
    expect(NIGHT_STARS.every(([x, y]) => x > 0 && x < 300 && y > 0 && y < 130)).toBe(true)
  })
})

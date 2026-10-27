import { describe, expect, it } from 'vitest'
import { ACCEL, MODES, obstacleBars, SKIN_M, START, step, type FlyEnv, type Sticks } from './flyModel.ts'

const NONE: Sticks = { yaw: 0, climb: 0, side: 0, forward: 0, tilt: 0 }
const open: FlyEnv = { mode: 'normal', ceilingM: 120, surfaceAt: () => 0, wind: null }
const run = (env: FlyEnv, sticks: Sticks, seconds: number, from = START) => {
  let s = from
  for (let t = 0; t < seconds; t += 0.05) s = step(s, sticks, env, 0.05)
  return s
}

describe('the Air 3S flight model', () => {
  it('full forward in Sport reaches the published 21 m/s, no faster, after easing up at ACCEL', () => {
    const s = run({ ...open, mode: 'sport' }, { ...NONE, forward: 1 }, 10, { ...START, alt: 30 })
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(21, 6)
    const early = run({ ...open, mode: 'sport' }, { ...NONE, forward: 1 }, 1, { ...START, alt: 30 })
    expect(Math.hypot(early.vx, early.vy)).toBeCloseTo(ACCEL * 1, 0)
    expect(MODES.sport.published).toBe(true)
    expect(MODES.cine.published).toBe(false)
  })

  it('climbs into the ceiling and is held there: the invisible wall', () => {
    const s = run(open, { ...NONE, climb: 1 }, 60)
    expect(s.alt).toBe(120)
    expect(s.held).toBe('ceiling')
  })

  it('cannot fly into a roof: a 20 m block ahead stops it at the wall', () => {
    const env: FlyEnv = { ...open, surfaceAt: (_x, y) => (y > 50 ? 20 : 0) }
    const s = run(env, { ...NONE, forward: 1 }, 20, { ...START, alt: 10 })
    expect(s.y).toBeLessThanOrEqual(50.5)
    expect(s.held).toBe('obstacle')
    expect(obstacleBars(s, env).front).not.toBeNull()
  })

  it('never sinks into what stands under it', () => {
    const env: FlyEnv = { ...open, surfaceAt: () => 12 }
    const s = run(env, { ...NONE, climb: -1 }, 10, { ...START, alt: 30 })
    expect(s.alt).toBeGreaterThanOrEqual(12 + SKIN_M - 1e-9)
  })

  it('a 10 m/s north wind drifts it south a little while it hovers', () => {
    const s = run({ ...open, wind: { fromDeg: 0, mps: 10 } }, NONE, 10, { ...START, alt: 30 })
    expect(s.y).toBeLessThan(0)
    expect(Math.abs(s.x)).toBeLessThan(1e-9)
  })

  it('turns at the mode yaw rate, and the gimbal stays in -90..60', () => {
    expect(run(open, { ...NONE, yaw: 1 }, 1).yaw).toBeCloseTo(MODES.normal.yawDegS, 0)
    expect(run(open, { ...NONE, tilt: -200 }, 2).gimbal).toBe(-90)
  })
})

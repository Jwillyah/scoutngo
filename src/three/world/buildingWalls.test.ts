import { describe, expect, it } from 'vitest'
import { counterClockwise, wallQuad } from './buildings.ts'

/*
 * EVERY WALL FACES OUT (Batch F, Section 2): the VB pier's hotels were dark
 * boxes because clockwise rings wound their walls inward. Fixtures only.
 */
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i])

function outward(ring: { x: number; y: number }[]): boolean[] {
  const r = counterClockwise(ring)
  const cx = r.reduce((s, p) => s + p.x, 0) / r.length
  const cy = r.reduce((s, p) => s + p.y, 0) / r.length
  return r.map((a, i) => {
    const c = r[(i + 1) % r.length]
    const q = wallQuad(a, c, 0, 10)
    const n = cross(sub(q[1], q[0]), sub(q[2], q[0]))
    /* Scene z is minus north: the wall's middle, away from the centre. */
    const away = [(a.x + c.x) / 2 - cx, 0, -((a.y + c.y) / 2 - cy)]
    return n[0] * away[0] + n[2] * away[2] > 0
  })
}

describe('building walls', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 30 },
    { x: 0, y: 30 },
  ]
  it('face out for a counter-clockwise ring', () => {
    expect(outward(square)).toEqual([true, true, true, true])
  })
  it('face out for a clockwise ring too', () => {
    expect(outward([...square].reverse())).toEqual([true, true, true, true])
  })
  it('the east wall of a building faces east, toward a low morning sun', () => {
    const r = counterClockwise([...square].reverse())
    const i = r.findIndex((p, k) => p.x === 20 && r[(k + 1) % r.length].x === 20)
    const q = wallQuad(r[i], r[(i + 1) % r.length], 0, 10)
    const n = cross(sub(q[1], q[0]), sub(q[2], q[0]))
    expect(n[0]).toBeGreaterThan(0)
    expect(Math.abs(n[2])).toBeLessThan(1e-9)
  })
})

import { describe, expect, it } from 'vitest'
import { placePills } from '../src/core/pillPlace.ts'

/* Batch MAP2, Section 2: the Buoys page's labels never overlap. */
describe('placing pills', () => {
  it('never overlaps two pills, even with every pin at one spot', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ x: 150 + i * 3, y: 100 + i * 2, w: 120, h: 18 }))
    const got = placePills(items, 360, 220)
    const boxes = got.flatMap((g, i) => (g === null ? [] : [{ ...g, w: items[i].w, h: items[i].h }]))
    expect(boxes.length).toBeGreaterThan(2)
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(2)
      expect(b.x + b.w).toBeLessThanOrEqual(358)
      expect(b.y).toBeGreaterThanOrEqual(2)
      expect(b.y + b.h).toBeLessThanOrEqual(218)
    }
  })
  it('puts a lone pill above its pin', () => {
    expect(placePills([{ x: 180, y: 120, w: 100, h: 18 }], 360, 220)[0]).toEqual({ x: 130, y: 90 })
  })
})

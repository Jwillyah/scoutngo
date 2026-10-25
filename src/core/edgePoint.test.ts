import { describe, expect, it } from 'vitest'
import { edgePoint } from './edgePoint.ts'

const box = { left: 0, top: 100, right: 400, bottom: 600 }
const half = { w: 30, h: 12 }

describe('where a ray meets the edge of the free map', () => {
  it('runs east to the right edge, the pill wholly inside', () => {
    expect(edgePoint({ x: 200, y: 300 }, { x: 1, y: 0 }, box, half)).toEqual({ x: 370, y: 300 })
  })
  it('runs north to the top of the free map, under the chrome', () => {
    expect(edgePoint({ x: 200, y: 300 }, { x: 0, y: -1 }, box, half)).toEqual({ x: 200, y: 112 })
  })
  it('takes the nearer edge on a diagonal', () => {
    const p = edgePoint({ x: 200, y: 500 }, { x: 1, y: 1 }, box, half)
    expect(p?.y).toBeCloseTo(588)
    expect(p?.x).toBeCloseTo(288)
  })
  it('draws nothing for a pin off screen', () => {
    expect(edgePoint({ x: 200, y: 50 }, { x: 1, y: 0 }, box, half)).toBeNull()
  })
})

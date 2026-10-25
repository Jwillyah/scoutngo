import { describe, expect, it } from 'vitest'
import { colorChance } from './colorChance.ts'

describe('colour chance from the three layers', () => {
  it('is good with a canvas up high and a gap down low', () => {
    expect(colorChance({ low: 10, mid: 40, high: 50 }).chance).toBe('good')
  })
  it('is poor when low cloud blocks, whatever is above', () => {
    expect(colorChance({ low: 85, mid: 40, high: 50 }).chance).toBe('poor')
  })
  it('is poor with nothing up there to light', () => {
    expect(colorChance({ low: 0, mid: 5, high: 10 }).chance).toBe('poor')
  })
  it('is only some under a thick lid or with broken low cloud', () => {
    expect(colorChance({ low: 0, mid: 95, high: 20 }).chance).toBe('some')
    expect(colorChance({ low: 45, mid: 40, high: 10 }).chance).toBe('some')
  })
  it('does not guess with the low layer missing', () => {
    expect(colorChance({ low: null, mid: 40, high: 50 }).chance).toBe('unknown')
    expect(colorChance({ low: 10, mid: null, high: null }).chance).toBe('unknown')
  })
})

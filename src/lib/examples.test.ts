import { describe, expect, it } from 'vitest'
import { exampleIndex, SHOOT_EXAMPLES, SHOT_LIST_EXAMPLES } from './examples.ts'

describe('the example sets', () => {
  /*
   * The point of the set: whatever someone shoots, something here looks like it.
   * One baked-in example told every other photographer the tool was not for them.
   */
  it('spans different kinds of work', () => {
    const all = SHOOT_EXAMPLES.join(' ').toLowerCase()
    for (const kind of ['wedding', 'surf', 'car', 'product', 'concert']) {
      expect(all).toContain(kind)
    }
  })

  it("does not ship the author's own shoot as the example", () => {
    const all = [...SHOOT_EXAMPLES, ...SHOT_LIST_EXAMPLES].join(' ').toLowerCase()
    expect(all).not.toContain('brew river')
    expect(all).not.toContain('boat docking')
    expect(all).not.toContain('salisbury')
  })

  it('keeps them short enough to read as a hint', () => {
    for (const example of SHOOT_EXAMPLES) {
      expect(example.length).toBeLessThanOrEqual(70)
    }
  })

  it('pairs a shot list with every shoot', () => {
    expect(SHOT_LIST_EXAMPLES).toHaveLength(SHOOT_EXAMPLES.length)
  })

  it('writes every shot list as one shot per line', () => {
    for (const list of SHOT_LIST_EXAMPLES) {
      expect(list.split('\n').length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('exampleIndex', () => {
  it('stays inside the set', () => {
    for (const random of [0, 0.25, 0.5, 0.999]) {
      const index = exampleIndex(SHOOT_EXAMPLES.length, random)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(SHOOT_EXAMPLES.length)
    }
  })

  /* Math.random() is [0,1) but rounding has bitten this pattern before. */
  it('never runs off the end, even at the boundary', () => {
    expect(exampleIndex(5, 1)).toBe(4)
    expect(exampleIndex(5, 0.9999999999)).toBe(4)
  })

  it('handles an empty set rather than returning -1', () => {
    expect(exampleIndex(0)).toBe(0)
  })

  it('reaches every example across the range', () => {
    const seen = new Set(
      Array.from({ length: 100 }, (_, i) => exampleIndex(SHOOT_EXAMPLES.length, i / 100)),
    )
    expect(seen.size).toBe(SHOOT_EXAMPLES.length)
  })
})

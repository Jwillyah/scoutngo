import { describe, expect, it } from 'vitest'
import { blocksOn, leafState, LEAF_COPY, TEMPERATE_MIN_LATITUDE } from './leaf.ts'

/* Newport News, Virginia: the shoot this came from. */
const VA = 37.09
const NSW = -33.87
const PANAMA = 8.98

describe('a deciduous tree through a northern year', () => {
  const at = (month: string) => leafState(`2026-${month}-15`, VA)

  it('is bare through the winter', () => {
    for (const m of ['12', '01', '02']) expect(at(m), m).toBe('bare')
  })

  it('is in leaf through the summer', () => {
    for (const m of ['05', '06', '07', '08', '09']) expect(at(m), m).toBe('in-leaf')
  })

  /*
   * THE SHOULDERS SAY SO. Mid-April in Virginia genuinely goes either way, and
   * a wrong "bare" in late April is a tree the shooter did not plan around.
   */
  it('refuses to pick a side in the shoulder months', () => {
    for (const m of ['03', '04', '10', '11']) expect(at(m), m).toBe('turning')
  })

  /* The shoot that prompted this: an October afternoon. */
  it('calls the reported shoot date a shoulder', () => {
    expect(leafState('2026-10-16', VA)).toBe('turning')
  })
})

describe('the southern hemisphere is six months out', () => {
  it('is in leaf at Christmas and bare in July', () => {
    expect(leafState('2026-12-15', NSW)).toBe('in-leaf')
    expect(leafState('2026-07-15', NSW)).toBe('bare')
  })

  it('mirrors the northern answer at the opposite latitude', () => {
    expect(leafState('2026-01-15', NSW)).toBe('in-leaf')
    expect(leafState('2026-01-15', VA)).toBe('bare')
  })
})

/*
 * THE TROPICS ARE NOT GUESSED AT. Dry-season deciduousness runs on rainfall,
 * which this module does not have, so it says it does not know rather than
 * applying a Virginia calendar to Panama.
 */
describe('it says it does not know where it does not', () => {
  it('is unknown inside the tropics', () => {
    expect(leafState('2026-01-15', PANAMA)).toBe('unknown')
    expect(leafState('2026-07-15', PANAMA)).toBe('unknown')
    expect(leafState('2026-07-15', -PANAMA)).toBe('unknown')
  })

  it('has an opinion just outside them', () => {
    expect(leafState('2026-01-15', TEMPERATE_MIN_LATITUDE + 0.5)).toBe('bare')
    expect(leafState('2026-01-15', TEMPERATE_MIN_LATITUDE - 0.5)).toBe('unknown')
  })

  it('is unknown for a date it cannot read, rather than guessing a month', () => {
    for (const bad of ['', 'today', '2026-13-01', '15/10/2026', '2026-10']) {
      expect(leafState(bad, VA), bad).toBe('unknown')
    }
  })
})

/*
 * WHAT BLOCKS. Anything but 'bare', because a shoulder month is not a reason
 * to delete a tree from the geometry: the tree is still there and the leaves
 * might be. Treating 'turning' as clear would be the app taking the optimistic
 * side of the one thing it said it could not know.
 */
describe('what counts as blocking', () => {
  it('blocks for anything solid, whatever the date says', () => {
    for (const state of ['bare', 'in-leaf', 'turning', 'unknown'] as const) {
      expect(blocksOn('solid', state), state).toBe(true)
    }
  })

  it('lets a deciduous obstruction through only when it is likely bare', () => {
    expect(blocksOn('deciduous', 'bare')).toBe(false)
    expect(blocksOn('deciduous', 'in-leaf')).toBe(true)
    expect(blocksOn('deciduous', 'turning')).toBe(true)
    expect(blocksOn('deciduous', 'unknown')).toBe(true)
  })
})

describe('the wording claims no more than it knows', () => {
  it('hedges every state it cannot be sure of', () => {
    expect(LEAF_COPY.bare).toContain('likely')
    expect(LEAF_COPY['in-leaf']).toContain('likely')
    expect(LEAF_COPY.turning).toContain('either way')
  })

  /* No date, no species, no promise. */
  it('names no month, no species and no certainty', () => {
    for (const text of Object.values(LEAF_COPY)) {
      expect(text).not.toMatch(/\d/)
      expect(text.toLowerCase()).not.toMatch(/\b(will|always|never|certain|guaranteed)\b/)
    }
  })
})

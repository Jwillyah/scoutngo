import { describe, expect, it } from 'vitest'
import {
  allowedPlatforms,
  DEFAULT_PLATFORM_FILTER,
  filterByPlatform,
  hiddenByFilter,
  PLATFORM_FILTER_LABEL,
  PLATFORM_FILTERS,
  platformCounts,
  showsPlatform,
  type PlatformFilter,
} from './platformFilter.ts'

const list = [
  { id: 'a', platform: 'ground' as const },
  { id: 'b', platform: 'air' as const },
  { id: 'c', platform: 'ground' as const },
  { id: 'd', platform: 'air' as const },
  { id: 'e', platform: 'ground' as const },
]

describe('the predicate', () => {
  it('shows everything on both', () => {
    expect(showsPlatform('both', 'ground')).toBe(true)
    expect(showsPlatform('both', 'air')).toBe(true)
  })

  it('shows one and hides the other when set to one', () => {
    expect(showsPlatform('ground', 'ground')).toBe(true)
    expect(showsPlatform('ground', 'air')).toBe(false)
    expect(showsPlatform('air', 'air')).toBe(true)
    expect(showsPlatform('air', 'ground')).toBe(false)
  })

  it('starts on both, so nothing is hidden until it is chosen', () => {
    expect(DEFAULT_PLATFORM_FILTER).toBe('both')
    expect(hiddenByFilter(list, DEFAULT_PLATFORM_FILTER)).toBe(0)
  })
})

/*
 * THE VIEW AND THE REQUEST HAVE TO AGREE. This is the reason the predicate is
 * in core rather than in the component: a generate that can return a platform
 * the map then hides is how a plan quietly loses half of itself.
 */
describe('what shows and what a generate may return are the same choice', () => {
  for (const filter of PLATFORM_FILTERS) {
    it(`agrees with itself on ${filter}`, () => {
      const allowed = allowedPlatforms(filter)
      for (const platform of ['ground', 'air'] as const) {
        expect(allowed.includes(platform)).toBe(showsPlatform(filter, platform))
      }
      // Nothing a generate may return can be hidden by the same filter.
      const returned = allowed.map((platform, index) => ({ id: String(index), platform }))
      expect(hiddenByFilter(returned, filter)).toBe(0)
    })
  }

  it('never allows an empty set, because that is a generate with nothing to do', () => {
    for (const filter of PLATFORM_FILTERS) {
      expect(allowedPlatforms(filter).length).toBeGreaterThan(0)
    }
  })
})

describe('filtering a list', () => {
  it('keeps order and identity', () => {
    expect(filterByPlatform(list, 'ground').map((p) => p.id)).toEqual(['a', 'c', 'e'])
    expect(filterByPlatform(list, 'air').map((p) => p.id)).toEqual(['b', 'd'])
    expect(filterByPlatform(list, 'both')).toEqual(list)
  })

  it('counts each platform', () => {
    expect(platformCounts(list)).toEqual({ ground: 3, air: 2 })
    expect(platformCounts([])).toEqual({ ground: 0, air: 0 })
  })

  /* So the control can SAY it is hiding things rather than just hiding them. */
  it('says how many it is hiding', () => {
    expect(hiddenByFilter(list, 'ground')).toBe(2)
    expect(hiddenByFilter(list, 'air')).toBe(3)
    expect(hiddenByFilter(list, 'both')).toBe(0)
  })

  it('hides nothing from an empty plan', () => {
    for (const filter of PLATFORM_FILTERS) {
      expect(hiddenByFilter([], filter)).toBe(0)
    }
  })
})

describe('the control', () => {
  it('offers exactly three, both first', () => {
    expect(PLATFORM_FILTERS).toEqual(['both', 'ground', 'air'])
  })

  it('names every one of them', () => {
    for (const filter of PLATFORM_FILTERS) {
      expect(PLATFORM_FILTER_LABEL[filter as PlatformFilter]).toBeTruthy()
    }
  })
})

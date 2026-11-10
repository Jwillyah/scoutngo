import { describe, expect, it } from 'vitest'
import { menuCardList } from '../src/core/menuCards.ts'

describe('the menu in look D (Batch Flow, Section 8; board D_Menu)', () => {
  it('Weather first, then the home in its order, no Moon', () => {
    expect(menuCardList(['surf', 'wind', 'tide', 'sky', 'moon', 'drone'], true)).toEqual(['weather', 'surf', 'wind', 'tide', 'sky', 'drone'])
  })
  it('Sky always, second when the home has none', () => {
    expect(menuCardList(['surf', 'wind', 'tide'], false)).toEqual(['weather', 'sky', 'surf', 'wind', 'tide'])
  })
  it('the Drone only with drone tools, and then always, last when the home does not show it', () => {
    expect(menuCardList(['drone', 'wind'], false)).toEqual(['weather', 'sky', 'wind'])
    expect(menuCardList(['drone', 'wind'], true)).toEqual(['weather', 'sky', 'drone', 'wind'])
    expect(menuCardList(['surf', 'wind', 'tide'], true)).toEqual(['weather', 'sky', 'surf', 'wind', 'tide', 'drone'])
  })
})

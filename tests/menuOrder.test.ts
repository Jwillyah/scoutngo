import { describe, expect, it } from 'vitest'
import { cardList } from '../src/core/homeDay.ts'
import { menuCardList, menuOrder } from '../src/core/menuCards.ts'

/* Batch Pages, Section 5: the menu's Sky, Water and Drone cards come in the home's order (Today first, always). */
describe("the menu's cards", () => {
  it('follow the home: a surfer gets Water first, a shooter Sky, a pilot the Drone', () => {
    expect(menuOrder(cardList(['surf'], true))).toEqual(['water', 'sky', 'drone'])
    expect(menuOrder(cardList(['shoot', 'surf'], false))).toEqual(['sky', 'water', 'drone'])
    expect(menuOrder(cardList(['drone', 'shoot'], true))).toEqual(['drone', 'water', 'sky'])
  })
  it('every card is there even when the home has not said', () => {
    expect(menuOrder([])).toEqual(['sky', 'water', 'drone'])
  })
})

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

import { describe, expect, it } from 'vitest'
import { cardList } from '../src/core/homeDay.ts'
import { menuOrder } from '../src/core/menuCards.ts'

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

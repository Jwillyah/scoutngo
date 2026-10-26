import { describe, expect, it } from 'vitest'
import { CARD_TITLE, CHIP_FOR, HOME, isHome, type CardKind } from './sheetCard.ts'

/*
 * ONE SUBJECT PER SURFACE, MADE UNREPRESENTABLE OTHERWISE.
 *
 * The sheet holds one SheetCard. There is no state in which it holds two, and
 * no state in which it holds none -- the shoot card is the home, not an empty
 * sheet. That is the whole reason the union exists, and these are the
 * properties the rest of the shell relies on.
 */

/* Every kind, written out once. If a kind is added to the union and not here,
 * the CARD_TITLE test below fails rather than quietly skipping it. */
const EVERY_KIND: CardKind[] = [
  'shoot',
  'golden',
  'wind',
  'cloud',
  'tide',
  'layers',
  'hazards',
  'airspace',
  'sky',
  'cams',
  'suncurve',
  'moonrise',
  'settings',
  'about',
  'callsheet',
]

describe('the sheet card union', () => {
  it('starts at the shoot, because that is what the app is for', () => {
    expect(HOME).toEqual({ kind: 'shoot' })
    expect(isHome(HOME)).toBe(true)
    expect(isHome({ kind: 'wind' })).toBe(false)
  })

  /*
   * A TITLE FOR EVERY KIND. Record<CardKind, string> makes the compiler
   * enforce this, which is the point of the type -- this test proves the type
   * is actually doing it rather than having been widened to Partial<> by
   * somebody adding a kind in a hurry.
   */
  it('names every card', () => {
    expect(Object.keys(CARD_TITLE).sort()).toEqual([...EVERY_KIND].sort())
    for (const kind of EVERY_KIND) {
      expect(CARD_TITLE[kind].length).toBeGreaterThan(0)
    }
  })

  it('gives every card a distinct name', () => {
    expect(new Set(Object.values(CARD_TITLE)).size).toBe(EVERY_KIND.length)
  })

  /*
   * EXACTLY FOUR CARDS HAVE A CHIP, and they are the four chips. The chip row
   * is fixed at four by docs/chips.md and enforced live in the surface audit;
   * this is the same count asserted where it is cheap, so adding a fifth
   * entry here fails in milliseconds rather than in a browser run.
   */
  it('maps exactly the four chips', () => {
    expect(Object.keys(CHIP_FOR).sort()).toEqual(['cloud', 'golden', 'tide', 'wind'])
  })

  /*
   * AND EACH ONE POINTS AT ITSELF. The map exists so a card opened from
   * somewhere other than its chip still lights the right chip; a chip
   * pointing at a different card is how the lit chip and the open card come
   * to disagree, which is shape A in docs/failure-modes.md.
   */
  it('points each chip card at its own chip', () => {
    for (const [card, chip] of Object.entries(CHIP_FOR)) {
      expect(chip).toBe(card)
    }
  })

  it('gives no chip to a card that is not a reading', () => {
    for (const kind of ['shoot', 'layers', 'about', 'hazards', 'airspace'] as CardKind[]) {
      expect(CHIP_FOR[kind]).toBeUndefined()
    }
  })
})

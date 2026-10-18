import { describe, expect, it } from 'vitest'
import { SHEET_DETENTS, detentRank, raisedTo, type SheetDetent } from './sheetDetent.ts'

describe('the detents', () => {
  it('are peek, half, full, in that order', () => {
    expect([...SHEET_DETENTS]).toEqual(['peek', 'half', 'full'])
    expect(detentRank('peek')).toBeLessThan(detentRank('half'))
    expect(detentRank('half')).toBeLessThan(detentRank('full'))
  })
})

/*
 * RAISE, NEVER LOWER.
 *
 * Every programmatic detent change in the app goes through raisedTo, so this
 * is the whole rule in one place. The failure it exists to prevent is the one
 * that is most annoying in the field: putting the sheet where you want it,
 * tapping a position, and having the app decide differently.
 */
describe('raise, never lower', () => {
  it('lifts a peeking sheet to half', () => {
    expect(raisedTo('peek', 'half')).toBe('half')
  })

  it('leaves half alone when asked for half', () => {
    expect(raisedTo('half', 'half')).toBe('half')
  })

  it('leaves FULL alone when asked for half, rather than dropping it', () => {
    expect(raisedTo('full', 'half')).toBe('full')
  })

  it('never lowers, for any pair', () => {
    for (const from of SHEET_DETENTS) {
      for (const to of SHEET_DETENTS) {
        const result = raisedTo(from, to)
        expect(detentRank(result), `${from} asked for ${to}`).toBeGreaterThanOrEqual(
          detentRank(from),
        )
      }
    }
  })

  it('is idempotent, so a re-render cannot walk the sheet upward', () => {
    let detent: SheetDetent = 'peek'
    for (let i = 0; i < 20; i += 1) detent = raisedTo(detent, 'half')
    expect(detent).toBe('half')
  })
})

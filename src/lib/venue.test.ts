import { describe, expect, it } from 'vitest'
import { approvedCeilingHere, EMPTY_VENUE, flyCeiling, laancHere, withApprovedCeiling, withCoordinates, withLaanc } from './venue.ts'

describe('the LAANC switch belongs to a place', () => {
  const at = { ...EMPTY_VENUE, latitude: '36.846580', longitude: '-75.976660' }

  it('is off until said, and on for the place it was said for', () => {
    expect(laancHere(at)).toBe(false)
    expect(laancHere(withLaanc(at, true))).toBe(true)
    expect(laancHere(withLaanc(withLaanc(at, true), false))).toBe(false)
  })

  it('turns off by itself when the pin moves, by any route', () => {
    const on = withLaanc(at, true)
    expect(laancHere(withCoordinates(on, { lat: 36.8466, lon: -75.97667 }))).toBe(false)
    expect(laancHere({ ...on, latitude: '36.9' })).toBe(false)
  })
})

/*
 * MY APPROVED CEILING. Atlantic Park's grid square says 250 ft; the
 * authorization held there is 200. Suggest flies under the lower.
 */
describe('my approved ceiling', () => {
  const at = withLaanc({ ...EMPTY_VENUE, latitude: '36.846580', longitude: '-75.976660' }, true)

  it('is the grid value until typed, then the lower of the two', () => {
    expect(approvedCeilingHere(at)).toBeNull()
    expect(flyCeiling(250, approvedCeilingHere(at))).toBe(250)
    const typed = withApprovedCeiling(at, '200')
    expect(approvedCeilingHere(typed)).toBe(200)
    expect(flyCeiling(250, 200)).toBe(200)
    /* Never above the grid: an authorization is not higher than the square it is for. */
    expect(flyCeiling(150, 200)).toBe(150)
    /* And never opens a square the map does not have. */
    expect(flyCeiling(null, 200)).toBeNull()
  })

  it('goes with the place: a moved pin or a re-set switch drops it', () => {
    const typed = withApprovedCeiling(at, '200')
    expect(approvedCeilingHere(withCoordinates(typed, { lat: 36.8466, lon: -75.97667 }))).toBeNull()
    expect(approvedCeilingHere(withLaanc(withLaanc(typed, false), true))).toBeNull()
  })

  it('reads only a whole number of feet from 1 to 400, and an empty box means the grid', () => {
    for (const bad of ['', '  ', '0', '-5', '401', '200.5', 'two hundred']) {
      expect(approvedCeilingHere(withApprovedCeiling(at, bad))).toBeNull()
    }
    expect(withApprovedCeiling(withApprovedCeiling(at, '200'), '').laancCeilingFeet).toBeUndefined()
    /* A hand-edited backup with a number where a string belongs is not trusted, and does not throw. */
    expect(approvedCeilingHere({ ...at, laancCeilingFeet: 200 as unknown as string })).toBeNull()
  })
})

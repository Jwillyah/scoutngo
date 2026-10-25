import { describe, expect, it } from 'vitest'
import { EMPTY_VENUE, laancHere, withCoordinates, withLaanc } from './venue.ts'

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

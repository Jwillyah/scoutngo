import { describe, expect, it } from 'vitest'
import { saneAzimuth, saneGust, sanePeriod, saneRange, saneSunsetHour, saneTide, saneWind } from '../src/core/sanity.ts'

/* Batch QA, Section 4: a violation is "—" (null), never a wrong number. */
describe('sanity', () => {
  it('no negative wind', () => {
    expect(saneWind(-0.1)).toBeNull()
    expect(saneWind(0)).toBe(0)
    expect(saneWind(Number.NaN)).toBeNull()
  })
  it('gusts at or over the wind', () => {
    expect(saneGust(4, 6)).toBeNull()
    expect(saneGust(6, 6)).toBe(6)
    expect(saneGust(8, null)).toBe(8)
    expect(saneGust(-1, null)).toBeNull()
  })
  it('surf range low at or under high', () => {
    expect(saneRange(3, 2)).toBeNull()
    expect(saneRange(2, 3)).toEqual({ lowFt: 2, highFt: 3 })
    expect(saneRange(-1, 3)).toBeNull()
  })
  it('period 2 to 25 s', () => {
    expect(sanePeriod(1.5)).toBeNull()
    expect(sanePeriod(26)).toBeNull()
    expect(sanePeriod(12)).toBe(12)
  })
  it('tide inside the station’s range', () => {
    expect(saneTide(5, 0.2, 3.4)).toBeNull()
    expect(saneTide(3.5, 0.2, 3.4)).toBe(3.5)
    expect(saneTide(-0.5, 0.2, 3.4)).toBeNull()
  })
  it('sunset between 4 and 9 PM local', () => {
    expect(saneSunsetHour(17.1)).toBe(true)
    expect(saneSunsetHour(3)).toBe(false)
    expect(saneSunsetHour(22)).toBe(false)
  })
  it('azimuth 0 to 360', () => {
    expect(saneAzimuth(-10)).toBe(350)
    expect(saneAzimuth(370)).toBe(10)
    expect(saneAzimuth(Number.NaN)).toBeNull()
  })
})

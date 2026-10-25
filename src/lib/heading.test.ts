import { describe, expect, it } from 'vitest'
import { headingOf } from './heading.ts'

describe('which way the phone points', () => {
  it("takes Safari's compass heading as it is", () => {
    expect(headingOf({ alpha: 10, webkitCompassHeading: 270 })).toBe(270)
  })

  it('turns an absolute alpha, which runs the other way, into a heading', () => {
    expect(headingOf({ alpha: 90, absolute: true })).toBe(270)
    expect(headingOf({ alpha: 0, absolute: true })).toBe(0)
  })

  /* A relative alpha knows nothing about north. Turning the map by it would point it wrong. */
  it('refuses a relative alpha rather than pretending it is north-based', () => {
    expect(headingOf({ alpha: 90, absolute: false })).toBeNull()
    expect(headingOf({ alpha: null })).toBeNull()
  })
})

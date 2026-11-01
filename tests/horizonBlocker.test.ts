import { describe, expect, it } from 'vitest'
import { destinationPoint } from '../src/core/geo.ts'
import { blockerWords, nameBlocker } from '../src/core/horizonBlocker.ts'
import { lightGoneLine, sunriseLine } from '../src/core/lightGone.ts'

/* Batch E, Section 4: the Day sheet at the pier, 1 Nov (phone). */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const square = (at: { lat: number; lon: number }, m = 15): [number, number][] => {
  const n = destinationPoint(at, 0, m), e = destinationPoint(at, 90, m), s = destinationPoint(at, 180, m), w = destinationPoint(at, 270, m)
  return [[w.lon, n.lat], [e.lon, n.lat], [e.lon, s.lat], [w.lon, s.lat], [w.lon, n.lat]]
}
const hotel = { ring: square(destinationPoint(PIER, 247, 300)), heightM: 40 }
const clock = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d)

describe('what the sun goes behind', () => {
  it('a hotel to the WSW at a flat beach is the buildings, not a ridge', () => {
    const what = nameBlocker(PIER, 247, 4, [hotel], [], 3)
    expect(what).toBe('buildings')
    expect(blockerWords(what, 247)).toBe('the buildings to the WSW')
  })
  it('a building too low for that horizon does not explain it', () => {
    expect(nameBlocker(PIER, 247, 12, [hotel], [], 3)).toBe('ground')
  })
  it('a building of unknown height counts close by: it is there and nothing says it is low', () => {
    expect(nameBlocker(PIER, 247, 4, [{ ring: hotel.ring, heightM: null }], [], 3)).toBe('buildings')
  })
  it('trees, when they are mapped', () => {
    expect(nameBlocker(PIER, 247, 2, [], [{ at: destinationPoint(PIER, 245, 120), heightM: 8 }], 3)).toBe('trees')
  })
  it('with relief and nothing built, the ridge; on low ground, higher ground', () => {
    expect(blockerWords(nameBlocker(PIER, 270, 2, [], [], 120), 270)).toBe('the ridge to the W')
    expect(blockerWords(nameBlocker(PIER, 270, 2, [], [], 4), 270)).toBe('higher ground to the W')
  })
  it('a building off the bearing does not count', () => {
    expect(nameBlocker(PIER, 200, 4, [hotel], [], 3)).toBe('ground')
  })
})

describe('the Day sheet lines', () => {
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 1, h, m))
  it('says the sunrise once when the skyline makes no difference', () => {
    expect(sunriseLine(at(11, 27), at(11, 27), clock, 'the ridge to the E')).toBe('Sunrise 6:27 AM')
    expect(sunriseLine(at(11, 31), at(11, 27), clock, 'the buildings to the ESE')).toBe('Sunrise 6:31 AM over the buildings to the ESE, 6:27 AM on a flat horizon')
  })
  it('names the blocker in the light-gone line', () => {
    expect(lightGoneLine(at(21, 58), at(22, 17), clock, 'the buildings to the WSW')).toBe('Light gone 4:58 PM behind the buildings to the WSW, 19 m before the flat sunset at 5:17 PM')
  })
})

import { describe, expect, it } from 'vitest'
import { destinationPoint, type LatLon } from './geo.ts'
import { biasBox, dedupeNearby, DUPLICATE_WITHIN_METERS } from './geocode.ts'

const VB: LatLon = { lat: 36.8529, lon: -75.978 }
const near = (metres: number, bearing = 90) => destinationPoint(VB, bearing, metres)

interface Hit extends LatLon {
  label: string
}
const hit = (label: string, at: LatLon): Hit => ({ label, ...at })

describe('dedupeNearby', () => {
  it('collapses two sources describing the same place', () => {
    const merged = dedupeNearby([hit('nominatim', VB), hit('photon', near(20))])
    expect(merged).toHaveLength(1)
    expect(merged[0].label).toBe('nominatim')
  })

  it('keeps genuinely different places', () => {
    const merged = dedupeNearby([hit('a', VB), hit('b', near(500))])
    expect(merged).toHaveLength(2)
  })

  /*
   * ORDER IS THE RANKING. A merge that quietly reorders can promote the wrong
   * answer to the top of a list someone is about to tap.
   */
  it('preserves order, so the first source stays first', () => {
    const merged = dedupeNearby([
      hit('first', VB),
      hit('second', near(900)),
      hit('third', near(1800)),
    ])
    expect(merged.map((m) => m.label)).toEqual(['first', 'second', 'third'])
  })

  it('treats the stated distance as the boundary', () => {
    const inside = dedupeNearby([hit('a', VB), hit('b', near(DUPLICATE_WITHIN_METERS - 5))])
    const outside = dedupeNearby([hit('a', VB), hit('b', near(DUPLICATE_WITHIN_METERS + 20))])
    expect(inside).toHaveLength(1)
    expect(outside).toHaveLength(2)
  })

  it('survives an empty list', () => {
    expect(dedupeNearby([])).toEqual([])
  })
})

describe('biasBox', () => {
  it('returns west, south, east, north in that order', () => {
    const [w, s, e, n] = biasBox(VB, 5000)
    expect(w).toBeLessThan(VB.lon)
    expect(e).toBeGreaterThan(VB.lon)
    expect(s).toBeLessThan(VB.lat)
    expect(n).toBeGreaterThan(VB.lat)
  })

  it('spans roughly the distance asked for', () => {
    const [, s, , n] = biasBox(VB, 5000)
    // 10km tall, in degrees of latitude.
    expect((n - s) * 111_320).toBeCloseTo(10_000, -2)
  })

  /* Longitude degrees shrink toward the poles, so the box must widen. */
  it('widens in longitude at high latitude', () => {
    const equator = biasBox({ lat: 0, lon: 0 }, 5000)
    const arctic = biasBox({ lat: 70, lon: 0 }, 5000)
    expect(arctic[2] - arctic[0]).toBeGreaterThan(equator[2] - equator[0])
  })

  it('does not blow up at the pole', () => {
    const box = biasBox({ lat: 90, lon: 0 }, 5000)
    expect(box.every((value) => Number.isFinite(value))).toBe(true)
  })
})

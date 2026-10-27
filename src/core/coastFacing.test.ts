import { describe, expect, it } from 'vitest'
import { angleApart, FACING_AGREE_DEG, facingByCircle, facingByNearest, isGlassy, windToBeach } from './coastFacing.ts'

const BEACH = { lat: 36.8436, lon: -75.9713 }
/* A straight north-south shore 200 m east of the venue: the sea is everything east of it. */
const eastSea = (at: { lat: number; lon: number }) => at.lon > BEACH.lon + 200 / (111_320 * Math.cos((BEACH.lat * Math.PI) / 180))
/* The same shore turned to run northeast-southwest, the sea to the southeast: the beach faces 135. */
const southeastSea = (at: { lat: number; lon: number }) => {
  const x = (at.lon - BEACH.lon) * 111_320 * Math.cos((BEACH.lat * Math.PI) / 180)
  const y = (at.lat - BEACH.lat) * 110_540
  return x - y > 200 * Math.SQRT2
}

describe('which way the beach faces, two ways', () => {
  it('a shore due east of the venue faces 90, by both methods', () => {
    const a = facingByCircle(BEACH, eastSea)
    const b = facingByNearest(BEACH, eastSea)
    expect(angleApart(a ?? -999, 90)).toBeLessThan(3)
    expect(angleApart(b ?? -999, 90)).toBeLessThan(3)
  })

  it('a shore to the southeast faces 135, and the methods agree', () => {
    const a = facingByCircle(BEACH, southeastSea) ?? -999
    const b = facingByNearest(BEACH, southeastSea) ?? -999
    expect(angleApart(a, 135)).toBeLessThan(5)
    expect(angleApart(a, b)).toBeLessThan(FACING_AGREE_DEG)
  })

  it('inland, no sea in reach: no facing at all', () => {
    expect(facingByCircle(BEACH, () => false)).toBeNull()
    expect(facingByNearest(BEACH, () => false)).toBeNull()
  })
})

/*
 * THE HAND-WORKED VIRGINIA BEACH EXAMPLE. The oceanfront faces about east
 * (90). A west wind (from 270) blows from the town out to sea: offshore. An
 * east wind (from 90) blows in off the water: onshore. A north wind runs
 * along the beach: cross.
 */
describe('the wind against the beach, Virginia Beach by hand', () => {
  it('west is offshore, east onshore, north and south cross', () => {
    expect(windToBeach(270, 90)).toBe('offshore')
    expect(windToBeach(250, 90)).toBe('offshore')
    expect(windToBeach(90, 90)).toBe('onshore')
    expect(windToBeach(120, 90)).toBe('onshore')
    expect(windToBeach(0, 90)).toBe('cross')
    expect(windToBeach(180, 90)).toBe('cross')
  })

  it('glassy is light wind, or offshore', () => {
    expect(isGlassy(1.5, 'onshore')).toBe(true)
    expect(isGlassy(6, 'offshore')).toBe(true)
    expect(isGlassy(6, 'onshore')).toBe(false)
    expect(isGlassy(6, null)).toBe(false)
  })
})

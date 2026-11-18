import { describe, expect, it } from 'vitest'
import { aboutHere, BANNER_MI, viewCentre } from '../src/core/awayWords.ts'
import { distanceMeters } from '../src/core/geo.ts'
import { nearHere, pickNear, type NearPlace } from '../src/lib/nearMe.ts'
import type { Special } from '../src/core/specialLight.ts'

/*
 * BANNERS ONLY ABOUT THE PLACE ON SCREEN (Batch 3D, Section 3.4). Phone, 17 Nov
 * 12:27 PM: the map over Wrightsville Beach, NC, and the card said "Sky color
 * at sunrise · Sandbridge", about 250 mi away. A banner needs its spot within
 * 25 mi of the map's middle and an event that has not ended.
 */
const SANDBRIDGE = { lat: 36.72, lon: -75.93 }
const WRIGHTSVILLE_VIEW = { south: 34.15, west: -77.86, north: 34.27, east: -77.73 }
const SANDBRIDGE_VIEW = { south: 36.68, west: -75.98, north: 36.76, east: -75.88 }
const LOOK = Date.parse('2026-11-17T17:27:00Z') /* 12:27 PM EST */
const SUNRISE_18 = new Date('2026-11-18T11:44:00Z') /* the next sunrise, within the 24 h the card looks */
const clock = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d)
const place: NearPlace = { name: 'Sandbridge', at: SANDBRIDGE, m: 0 }
const fire: { s: Special; place: NearPlace } = { s: { kind: 'fire', event: 'sunrise', from: SUNRISE_18, to: SUNRISE_18, agree: 3, of: 5, word: 'possible', why: '' }, place }

describe('the NC case', () => {
  const items = pickNear([fire], LOOK, clock, 'coast')

  it('the card had "Sky color at sunrise · Sandbridge", for a sunrise that had not come', () => {
    expect(items.map((i) => i.line)).toEqual(['Sky color at sunrise possible 6:44 AM · Sandbridge'])
    expect(items[0].until.getTime()).toBeGreaterThan(LOOK)
  })

  it('with the map over Wrightsville Beach, about 250 mi off: no banner', () => {
    const mi = distanceMeters(SANDBRIDGE, viewCentre(WRIGHTSVILLE_VIEW)) / 1609.344
    expect(mi).toBeGreaterThan(200)
    expect(mi).toBeLessThan(300)
    expect(nearHere(items, LOOK, viewCentre(WRIGHTSVILLE_VIEW))).toBeNull()
  })

  it('with the map over Sandbridge: the banner', () => {
    expect(nearHere(items, LOOK, viewCentre(SANDBRIDGE_VIEW))?.map((i) => i.line)).toEqual(['Sky color at sunrise possible 6:44 AM · Sandbridge'])
  })

  it('over Sandbridge, but the sunrise over: no banner', () => {
    expect(nearHere(items, SUNRISE_18.getTime() + 60_000, viewCentre(SANDBRIDGE_VIEW))).toBeNull()
  })

  it('the map not yet placed: no banner', () => {
    expect(nearHere(items, LOOK, null)).toBeNull()
  })
})

describe('the rule, by distance', () => {
  const until = new Date(LOOK + 3_600_000)
  const north = (mi: number) => ({ lat: SANDBRIDGE.lat + (mi * 1609.344) / 111_195, lon: SANDBRIDGE.lon })

  it(`within ${BANNER_MI} mi of the map's middle shows; past it does not`, () => {
    expect(BANNER_MI).toBe(25)
    expect(aboutHere(SANDBRIDGE, north(24.5), until, LOOK)).toBe(true)
    expect(aboutHere(SANDBRIDGE, north(25.5), until, LOOK)).toBe(false)
  })

  it('an event that has ended never shows, however near', () => {
    expect(aboutHere(SANDBRIDGE, SANDBRIDGE, new Date(LOOK), LOOK)).toBe(false)
    expect(aboutHere(SANDBRIDGE, SANDBRIDGE, new Date(LOOK - 1), LOOK)).toBe(false)
  })

  it("the map's middle is the view's", () => {
    expect(viewCentre({ south: 34, west: -78, north: 35, east: -77 })).toEqual({ lat: 34.5, lon: -77.5 })
  })
})

import { describe, expect, it } from 'vitest'
import { nearSpots, roundToKm, spotKind, type KnownSpot } from '../src/core/knownSpots.ts'
import { COAST_CAMS } from '../src/data/coastCams.ts'

/* "Where do you shoot?" (Batch I, Section 1): the spots the app knows near a place. */
const KNOWN: KnownSpot[] = COAST_CAMS.map((c) => ({ id: c.id, name: c.name, at: c.at, facing: c.facing }))

describe('known spots near a place', () => {
  it('near the Virginia Beach pier: the pier first, each name once, with its facing', () => {
    const near = nearSpots({ lat: 36.84, lon: -75.98 }, KNOWN)
    expect(near[0].spot.name).toBe('Virginia Beach Pier')
    expect(near[0].kind).toBe('pier')
    expect(near[0].facingWord).toMatch(/^faces /)
    expect(new Set(near.map((s) => s.spot.name)).size).toBe(near.length)
    expect(near.length).toBeLessThanOrEqual(5)
  })

  it('nothing known far inland', () => {
    expect(nearSpots({ lat: 39.74, lon: -104.99 }, KNOWN)).toEqual([])
  })

  it('names a spot by what it is', () => {
    expect(spotKind('Rudee Inlet')).toBe('inlet')
    expect(spotKind('Lynnhaven Bay')).toBe('bay')
    expect(spotKind('Wrightsville Beach')).toBe('beach')
    expect(spotKind('South Jetty')).toBe('jetty')
  })

  it('"use my location once" keeps it to about a kilometre', () => {
    expect(roundToKm({ lat: 36.8441234, lon: -75.9752345 })).toEqual({ lat: 36.84, lon: -75.98 })
  })
})

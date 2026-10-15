import { describe, expect, it } from 'vitest'
import { destinationPoint, type LatLon } from './geo.ts'
import {
  leadMinutes,
  offWindDegrees,
  rankUpwind,
  UPWIND_CONE_DEGREES,
  type Wind,
} from './upwind.ts'

const VENUE: LatLon = { lat: 36.9063, lon: -76.0836 }
const cam = (id: string, bearing: number, km: number) => ({
  id,
  at: destinationPoint(VENUE, bearing, km * 1000),
})

/*
 * WIND DIRECTION IS WHERE THE WIND COMES FROM. Getting this backwards would
 * rank the list exactly wrong, so it is the first thing asserted.
 */
describe('which way is upwind', () => {
  it('is zero off the wind when the bearing matches the wind direction', () => {
    // A westerly comes FROM 270, so a cam due west of you is directly upwind.
    expect(offWindDegrees(270, 270)).toBe(0)
  })

  it('is 180 off the wind directly downwind', () => {
    expect(offWindDegrees(90, 270)).toBe(180)
  })

  it('folds to the shorter way round', () => {
    expect(offWindDegrees(350, 10)).toBe(20)
    expect(offWindDegrees(10, 350)).toBe(20)
  })

  it('is 90 at right angles', () => {
    expect(offWindDegrees(0, 270)).toBe(90)
    expect(offWindDegrees(180, 270)).toBe(90)
  })
})

/*
 * ONLY THE COMPONENT ALONG THE WIND COUNTS. Weather travels along the wind,
 * not toward you, so a cam off to the side is less far upwind than it is away.
 */
describe('how long until it gets here', () => {
  it('is distance over speed when it is directly upwind', () => {
    // 18km at 10m/s is 1800s, which is 30 minutes.
    expect(leadMinutes(18_000, 0, 10)).toBeCloseTo(30, 6)
  })

  it('counts only the along-wind component off to the side', () => {
    // 60 degrees off, so half the distance counts: 15 minutes, not 30.
    expect(leadMinutes(18_000, 60, 10)).toBeCloseTo(15, 6)
  })

  /*
   * A CALM IS NOT A LONG LEAD TIME, it is the absence of one: in still air
   * that cloud is not coming at all, and reporting "900 minutes" would be a
   * number pretending to be an answer.
   */
  it('is null in a calm rather than an enormous number', () => {
    expect(leadMinutes(18_000, 0, 0)).toBeNull()
    expect(leadMinutes(18_000, 0, 0.4)).toBeNull()
  })

  it('is null at right angles and downwind', () => {
    expect(leadMinutes(18_000, 90, 10)).toBeNull()
    expect(leadMinutes(18_000, 150, 10)).toBeNull()
  })
})

describe('ranking a list of cams', () => {
  /** A westerly at 10m/s: wind coming FROM 270. */
  const WESTERLY: Wind = { fromDegrees: 270, speedMps: 10 }

  it('puts an upwind cam above a nearer downwind one', () => {
    const ranked = rankUpwind(
      VENUE,
      [cam('downwind-close', 90, 5), cam('upwind-far', 270, 40)],
      WESTERLY,
    )
    expect(ranked.map((r) => r.item.id)).toEqual(['upwind-far', 'downwind-close'])
    expect(ranked[0].isUpwind).toBe(true)
    expect(ranked[1].isUpwind).toBe(false)
  })

  it('orders the upwind ones by how soon the weather arrives', () => {
    const ranked = rankUpwind(
      VENUE,
      [cam('an-hour', 270, 36), cam('ten-minutes', 270, 6), cam('half-hour', 270, 18)],
      WESTERLY,
    )
    expect(ranked.map((r) => r.item.id)).toEqual(['ten-minutes', 'half-hour', 'an-hour'])
    expect(ranked[0].leadMinutes).toBeCloseTo(10, 0)
    expect(ranked[2].leadMinutes).toBeCloseTo(60, 0)
  })

  /*
   * SOONEST, NOT NEAREST. A cam 20km dead upwind beats one 10km at 55 degrees
   * off, because the weather over the first one arrives first.
   */
  it('prefers sooner over nearer inside the cone', () => {
    const ranked = rankUpwind(
      VENUE,
      [cam('near-but-oblique', 215, 10), cam('far-but-dead-on', 270, 12)],
      WESTERLY,
    )
    expect(ranked[0].item.id).toBe('near-but-oblique')
    // Which is the honest answer: 10km only 55 off is 5.7km upwind.
    expect(ranked[0].leadMinutes).toBeLessThan(ranked[1].leadMinutes ?? Infinity)
  })

  it('orders the downwind ones nearest first, since nothing else is left', () => {
    const ranked = rankUpwind(
      VENUE,
      [cam('far', 90, 50), cam('near', 90, 5)],
      WESTERLY,
    )
    expect(ranked.map((r) => r.item.id)).toEqual(['near', 'far'])
  })

  /*
   * NOTHING IS DROPPED. A downwind cam is still a cam, listed with its angle,
   * so the reader can see why it is at the bottom rather than wondering where
   * it went.
   */
  it('keeps every cam and reports its angle', () => {
    const cams = [cam('a', 0, 10), cam('b', 90, 10), cam('c', 180, 10), cam('d', 270, 10)]
    const ranked = rankUpwind(VENUE, cams, WESTERLY)
    expect(ranked).toHaveLength(4)
    expect(new Set(ranked.map((r) => r.item.id))).toEqual(new Set(['a', 'b', 'c', 'd']))
    for (const r of ranked) {
      expect(r.offWindDegrees).toBeGreaterThanOrEqual(0)
      expect(r.offWindDegrees).toBeLessThanOrEqual(180)
      expect(r.distanceMeters).toBeGreaterThan(0)
    }
  })

  it('marks the cone boundary consistently with the constant', () => {
    const inside = rankUpwind(VENUE, [cam('x', 270 - UPWIND_CONE_DEGREES + 1, 10)], WESTERLY)
    const outside = rankUpwind(VENUE, [cam('x', 270 - UPWIND_CONE_DEGREES - 5, 10)], WESTERLY)
    expect(inside[0].isUpwind).toBe(true)
    expect(outside[0].isUpwind).toBe(false)
  })

  /* In a calm nothing is arriving, so there is no lead time to sort by. */
  it('falls back to distance in a calm', () => {
    const calm: Wind = { fromDegrees: 270, speedMps: 0 }
    const ranked = rankUpwind(VENUE, [cam('far', 270, 40), cam('near', 270, 8)], calm)
    expect(ranked.map((r) => r.item.id)).toEqual(['near', 'far'])
    for (const r of ranked) expect(r.leadMinutes).toBeNull()
  })

  it('handles an empty list', () => {
    expect(rankUpwind(VENUE, [], WESTERLY)).toEqual([])
  })

  /*
   * A REAL CASE. Shooting Lesner Bridge at sunrise on a northwesterly: the cam
   * that matters is the one up the bay toward the weather, not the one out at
   * the oceanfront behind you.
   */
  it('ranks a northwesterly at Lesner Bridge the way the day works', () => {
    const nw: Wind = { fromDegrees: 315, speedMps: 8 }
    const ranked = rankUpwind(
      VENUE,
      [
        cam('oceanfront-se', 135, 12),
        cam('up-the-bay-nw', 315, 25),
        cam('cbbt-nnw', 335, 9),
      ],
      nw,
    )
    expect(ranked[0].item.id).toBe('cbbt-nnw')
    expect(ranked[1].item.id).toBe('up-the-bay-nw')
    expect(ranked[2].item.id).toBe('oceanfront-se')
    expect(ranked[2].isUpwind).toBe(false)
  })
})

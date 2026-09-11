import { describe, expect, it } from 'vitest'
import {
  angularDistance,
  assessCoverage,
  assessRangeVariety,
  MIN_SECTORS,
  sectorOf,
} from './coverage.ts'

describe('sectorOf', () => {
  it('cuts the compass into four quadrants from north', () => {
    expect(sectorOf(0)).toBe(0)
    expect(sectorOf(89.9)).toBe(0)
    expect(sectorOf(90)).toBe(1)
    expect(sectorOf(180)).toBe(2)
    expect(sectorOf(270)).toBe(3)
  })

  it('wraps rather than falling off the end', () => {
    expect(sectorOf(360)).toBe(0)
    expect(sectorOf(-1)).toBe(3)
    expect(sectorOf(725)).toBe(0)
  })
})

describe('angularDistance', () => {
  it('takes the short way round the compass', () => {
    expect(angularDistance(350, 10)).toBe(20)
    expect(angularDistance(10, 350)).toBe(20)
    expect(angularDistance(0, 180)).toBe(180)
    expect(angularDistance(90, 90)).toBe(0)
  })
})

describe('assessCoverage', () => {
  /*
   * THE REGRESSION THIS FILE EXISTS FOR. Two live runs returned six positions,
   * all on the south bank of the river, all front-lit. Every bearing from the
   * subject fell in the southern half, so at most two quadrants were touched.
   * If this ever reports such a plan as covered, the check has stopped working.
   */
  it('calls the real clustered run a cluster', () => {
    // Six positions strung along the south bank: bearings 165 to 200 or so.
    const southBank = [168, 175, 181, 186, 193, 199]
    const coverage = assessCoverage(southBank)
    expect(coverage.clustered).toBe(true)
    expect(coverage.sectorCount).toBeLessThan(MIN_SECTORS)
    expect(coverage.spreadDegrees).toBeLessThan(45)
    expect(coverage.hasOppositeSide).toBe(false)
  })

  it('accepts a plan that works its way round the subject', () => {
    const coverage = assessCoverage([20, 110, 200, 290])
    expect(coverage.clustered).toBe(false)
    expect(coverage.sectorCount).toBe(4)
    expect(coverage.occupiedSectors).toEqual([0, 1, 2, 3])
    expect(coverage.hasOppositeSide).toBe(true)
  })

  it('accepts exactly three sectors, which is the stated minimum', () => {
    const coverage = assessCoverage([10, 100, 190])
    expect(coverage.sectorCount).toBe(MIN_SECTORS)
    expect(coverage.clustered).toBe(false)
  })

  it('counts sectors, not positions: five views of one bank is still a cluster', () => {
    const coverage = assessCoverage([181, 182, 183, 184, 185])
    expect(coverage.sectorCount).toBe(1)
    expect(coverage.clustered).toBe(true)
  })

  describe('spreadDegrees', () => {
    it('is zero for a single position and 180 for a straight opposition', () => {
      expect(assessCoverage([90]).spreadDegrees).toBe(0)
      expect(assessCoverage([0, 180]).spreadDegrees).toBe(180)
    })

    it('measures the arc covered, not the numeric range', () => {
      // 350 and 10 are 20 degrees apart across north, not 340.
      expect(assessCoverage([350, 10]).spreadDegrees).toBeCloseTo(20, 6)
    })

    it('grows as the plan opens out', () => {
      expect(assessCoverage([170, 190]).spreadDegrees).toBeLessThan(
        assessCoverage([90, 180, 270]).spreadDegrees,
      )
    })
  })

  describe('dominantBearing', () => {
    /* The arithmetic mean of 350 and 10 is 180, which points the wrong way. */
    it('is a direction, not an average of numbers', () => {
      expect(assessCoverage([350, 10]).dominantBearing).toBeCloseTo(0, 6)
    })

    it('points at the majority when there is one', () => {
      const coverage = assessCoverage([170, 180, 190, 0])
      expect(angularDistance(coverage.dominantBearing!, 180)).toBeLessThan(45)
    })

    it('is null when the plan cancels out perfectly', () => {
      expect(assessCoverage([0, 180]).dominantBearing).toBeNull()
    })
  })

  describe('hasOppositeSide', () => {
    it('is false when every position sits on one side of the subject', () => {
      expect(assessCoverage([160, 180, 200]).hasOppositeSide).toBe(false)
    })

    /*
     * The position that makes this true will usually compute BACKLIT, and that is
     * the point. Shooting into the sun for rim light and spray off the water is a
     * real choice, and the tool should be able to offer it, labelled honestly by
     * lighting.ts rather than quietly never proposed.
     */
    it('is true when one position crosses to the far side, backlit or not', () => {
      expect(assessCoverage([160, 180, 200, 5]).hasOppositeSide).toBe(true)
    })

    it('needs more than a nudge: 90 degrees off is not the opposite side', () => {
      expect(assessCoverage([180, 180, 270]).hasOppositeSide).toBe(false)
      expect(assessCoverage([180, 180, 300]).hasOppositeSide).toBe(true)
    })

    it('treats a perfectly balanced plan as covered', () => {
      expect(assessCoverage([0, 180]).hasOppositeSide).toBe(true)
    })
  })

  /*
   * A live run placed a deck-rail position exactly on the venue pin, which is
   * also the default subject. bearingBetween of two identical points is an
   * arbitrary number, and it was being counted as a covered sector. Positions
   * without a bearing are now excluded by the caller and reported instead.
   */
  it('reports positions that were left out for having no bearing', () => {
    const coverage = assessCoverage([10, 100, 190], 1)
    expect(coverage.withoutBearing).toBe(1)
    expect(coverage.bearings).toHaveLength(3)
    expect(coverage.sectorCount).toBe(3)
  })

  it('defaults to counting none as bearingless', () => {
    expect(assessCoverage([10, 100, 190]).withoutBearing).toBe(0)
  })

  it('survives an empty plan without throwing', () => {
    const coverage = assessCoverage([])
    expect(coverage.sectorCount).toBe(0)
    expect(coverage.spreadDegrees).toBe(0)
    expect(coverage.dominantBearing).toBeNull()
  })
})

describe('assessRangeVariety', () => {
  const sample = (rangeMeters: number, maxStandoffMeters = 400) => ({
    rangeMeters,
    maxStandoffMeters,
  })

  it('flags a plan parked entirely at the back', () => {
    const variety = assessRangeVariety([sample(390), sample(370), sample(360)])
    expect(variety.allNearMaxStandoff).toBe(true)
    expect(variety.maxMeters).toBe(390)
    expect(variety.minMeters).toBe(360)
  })

  it('passes a plan with near work in it', () => {
    expect(assessRangeVariety([sample(390), sample(120), sample(360)]).allNearMaxStandoff).toBe(
      false,
    )
  })

  /* Each position is judged against ITS OWN ceiling, which depends on focal. */
  it('judges each position against its own standoff ceiling', () => {
    // 90m on a 100m ceiling is parked at the back; 90m on a 450m one is not.
    expect(assessRangeVariety([sample(90, 100), sample(95, 100)]).allNearMaxStandoff).toBe(true)
    expect(assessRangeVariety([sample(90, 450), sample(95, 450)]).allNearMaxStandoff).toBe(false)
  })

  it('says nothing about a single position, which cannot be varied', () => {
    expect(assessRangeVariety([sample(400)]).allNearMaxStandoff).toBe(false)
  })

  it('survives an empty plan', () => {
    expect(assessRangeVariety([])).toEqual({
      minMeters: 0,
      maxMeters: 0,
      allNearMaxStandoff: false,
    })
  })
})

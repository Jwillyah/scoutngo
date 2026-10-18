import { describe, expect, it } from 'vitest'
import {
  SAMPLE_DISTANCES_METERS,
  horizonAngleDegrees,
  sunVisibility,
  type TerrainSample,
} from './horizon.ts'

const s = (distanceMeters: number, elevationMeters: number | null): TerrainSample => ({
  distanceMeters,
  elevationMeters,
})

describe('the horizon angle along a bearing', () => {
  it('is zero across flat ground at the observer height', () => {
    expect(horizonAngleDegrees([s(1000, 100), s(2000, 100)], 100)).toBeCloseTo(0, 6)
  })

  it('is 45 degrees for a rise equal to its distance', () => {
    expect(horizonAngleDegrees([s(1000, 1100)], 100)).toBeCloseTo(45, 6)
  })

  /*
   * THE HIGHEST ANGLE WINS, not the highest ground. A 200m bank at 300m blocks
   * more sky than a 1000m ridge at 20km, and taking the tallest elevation
   * rather than the steepest angle gets that backwards.
   */
  it('takes the steepest angle, not the tallest ground', () => {
    const near = s(300, 300) /* 200m up at 300m out: about 33.7 degrees */
    const far = s(20_000, 1100) /* 1000m up at 20km: about 2.9 degrees */
    const angle = horizonAngleDegrees([near, far], 100)
    expect(angle).toBeCloseTo(33.69, 1)
  })

  /*
   * NEGATIVE IS A REAL ANSWER. On a summit everything along the bearing is
   * below you, which is why the sun stays visible lower from up there.
   */
  it('is negative from a summit', () => {
    const angle = horizonAngleDegrees([s(1000, 500), s(4000, 300)], 1000)
    expect(angle).toBeLessThan(0)
  })

  /*
   * NULL, NOT ZERO. Zero is a claim that the horizon is flat, which is the
   * claim this exists to replace.
   */
  it('is null when the DEM answered nothing', () => {
    expect(horizonAngleDegrees([s(1000, null), s(2000, null)], 100)).toBeNull()
    expect(horizonAngleDegrees([], 100)).toBeNull()
  })

  it('is null without an observer elevation', () => {
    expect(horizonAngleDegrees([s(1000, 500)], null)).toBeNull()
  })

  it('skips the samples it has no answer for and uses the rest', () => {
    expect(horizonAngleDegrees([s(1000, null), s(1000, 1100)], 100)).toBeCloseTo(45, 6)
  })

  it('ignores a sample at or behind the observer', () => {
    expect(horizonAngleDegrees([s(0, 9000), s(-100, 9000), s(1000, 1100)], 100)).toBeCloseTo(45, 6)
  })
})

describe('whether the sun is behind the ridge', () => {
  it('is behind when the terrain stands higher than the sun', () => {
    expect(sunVisibility(5, 12)).toBe('behind-terrain')
  })

  it('is clear when the sun is above the ridge', () => {
    expect(sunVisibility(20, 12)).toBe('clear-of-terrain')
  })

  /*
   * THREE STATES, NOT A BOOLEAN. "The DEM did not answer" must not render as
   * "nothing is in the way", which is the same rule as the hazard layer.
   */
  it('is unknown rather than clear when the terrain is unknown', () => {
    expect(sunVisibility(20, null)).toBe('unknown')
    expect(sunVisibility(Number.NaN, 5)).toBe('unknown')
  })

  it('treats the exact grazing angle as clear rather than hidden', () => {
    /* The limb is still showing at equality, and a hidden sun at exactly the
     * ridge angle would flicker as the DEM resolution changed. */
    expect(sunVisibility(12, 12)).toBe('clear-of-terrain')
  })
})

describe('where it samples', () => {
  it('grows the spacing with distance', () => {
    for (let i = 1; i < SAMPLE_DISTANCES_METERS.length; i += 1) {
      const gapNow = SAMPLE_DISTANCES_METERS[i] - SAMPLE_DISTANCES_METERS[i - 1]
      const gapBefore = i < 2 ? 0 : SAMPLE_DISTANCES_METERS[i - 1] - SAMPLE_DISTANCES_METERS[i - 2]
      expect(gapNow).toBeGreaterThanOrEqual(gapBefore)
    }
  })

  it('starts close enough to catch a bank and stops before curvature matters', () => {
    expect(SAMPLE_DISTANCES_METERS[0]).toBeLessThanOrEqual(100)
    expect(SAMPLE_DISTANCES_METERS[SAMPLE_DISTANCES_METERS.length - 1]).toBe(40_000)
  })
})

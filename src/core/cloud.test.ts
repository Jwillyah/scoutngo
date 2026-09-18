import { describe, expect, it } from 'vitest'
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import {
  cloudVerdict,
  SAMPLE_DISTANCES_KM,
  sightlineSamplePoints,
  summariseSightline,
  type CloudSample,
} from './cloud.ts'

const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }

describe('sightlineSamplePoints', () => {
  it('samples at the five stated distances', () => {
    const points = sightlineSamplePoints(VENUE, 90)
    expect(points.map((p) => p.distanceKm)).toEqual([...SAMPLE_DISTANCES_KM])
  })

  it('walks out along the bearing, not overhead', () => {
    for (const point of sightlineSamplePoints(VENUE, 45)) {
      expect(distanceMeters(VENUE, point.at) / 1000).toBeCloseTo(point.distanceKm, 0)
      expect(bearingBetween(VENUE, point.at)).toBeCloseTo(45, 0)
    }
  })

  it('follows the bearing it is given, in every direction', () => {
    for (const bearing of [0, 90, 180, 270, 359]) {
      const [first] = sightlineSamplePoints(VENUE, bearing)
      expect(bearingBetween(VENUE, first.at)).toBeCloseTo(bearing, 0)
    }
  })

  /*
   * The distances are far enough apart to land in different cells of a gridded
   * weather model. Sampling every kilometre would return the same cell five times
   * and read as corroboration when it is one number repeated.
   */
  it('spaces the samples widely enough to be independent', () => {
    const points = sightlineSamplePoints(VENUE, 180)
    for (let i = 1; i < points.length; i++) {
      expect(distanceMeters(points[i - 1].at, points[i].at)).toBeGreaterThan(9000)
    }
  })
})

describe('cloudVerdict', () => {
  it('calls a clear sightline clear', () => {
    expect(cloudVerdict({ worstLow: 5, meanMid: 10, meanHigh: 10 })).toBe('clear sightline')
  })

  /* Low cloud is the layer that removes a low sun, so it decides the verdict. */
  it('lets one solid low bank override everything else', () => {
    expect(cloudVerdict({ worstLow: 90, meanMid: 0, meanHigh: 0 })).toBe(
      'low cloud blocks the sightline',
    )
  })

  it('reports broken low cloud as light coming and going', () => {
    expect(cloudVerdict({ worstLow: 45, meanMid: 0, meanHigh: 0 })).toBe(
      'broken low cloud, light will come and go',
    )
  })

  /* High cirrus diffuses light rather than removing it. Different call. */
  it('separates high cloud from low, because they do different things', () => {
    expect(cloudVerdict({ worstLow: 5, meanMid: 0, meanHigh: 80 })).toBe(
      'thin high cloud, soft light',
    )
  })
})

describe('summariseSightline', () => {
  const sample = (distanceKm: number, low: number, mid = 0, high = 0): CloudSample => ({
    distanceKm,
    low,
    mid,
    high,
  })

  /*
   * THE REASON THIS IS A WORST CASE AND NOT AN AVERAGE. Four clear samples and one
   * solid bank at 40km averages to 18 percent low cloud, which reads as a fine
   * day. The shot is still lost. The worst sample is the answer.
   */
  it('reports the worst low cloud, not the average', () => {
    const summary = summariseSightline([
      sample(10, 0),
      sample(20, 0),
      sample(40, 90),
      sample(60, 0),
      sample(80, 0),
    ])
    expect(summary.worstLow).toBe(90)
    expect(summary.worstLowAtKm).toBe(40)
    expect(summary.meanLow).toBe(18)
    expect(summary.verdict).toBe('low cloud blocks the sightline')
  })

  it('names the distance the worst cloud sits at', () => {
    const summary = summariseSightline([sample(10, 20), sample(80, 75)])
    expect(summary.worstLowAtKm).toBe(80)
  })

  it('keeps the three layers apart', () => {
    const summary = summariseSightline([sample(10, 10, 20, 30), sample(20, 30, 40, 50)])
    expect(summary.meanLow).toBe(20)
    expect(summary.meanMid).toBe(30)
    expect(summary.meanHigh).toBe(40)
  })

  it('survives an empty sightline without claiming clear weather it cannot see', () => {
    const summary = summariseSightline([])
    expect(summary.samples).toEqual([])
    expect(summary.worstLowAtKm).toBeNull()
  })
})

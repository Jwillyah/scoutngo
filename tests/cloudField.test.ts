import { describe, expect, it } from 'vitest'
import { coveredShare, coverThreshold, fbm } from '../src/core/cloudField.ts'

/* Batch D, Section 5: the forecast's cover is the share of the sky the clouds take. */
describe('the cloud field', () => {
  it('cover 37% puts cloud over about 37% of a field it was not tuned on', () => {
    expect(coveredShare(coverThreshold(0.37))).toBeGreaterThan(0.33)
    expect(coveredShare(coverThreshold(0.37))).toBeLessThan(0.41)
  })
  it('the same for 10%, 60% and 90%', () => {
    for (const c of [0.1, 0.6, 0.9]) {
      const got = coveredShare(coverThreshold(c), 3000, 5000)
      expect(Math.abs(got - c), `cover ${c}: ${got}`).toBeLessThan(0.05)
    }
  })
  it('no cover, no cloud; full cover, all cloud', () => {
    expect(coveredShare(coverThreshold(0))).toBe(0)
    expect(coveredShare(coverThreshold(1))).toBe(1)
  })
  it('the noise is in 0..1 and smooth', () => {
    for (let i = 0; i < 200; i += 1) {
      const v = fbm(i * 0.37, i * 0.71)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(Math.abs(fbm(i * 0.37 + 0.001, i * 0.71) - v)).toBeLessThan(0.02)
    }
  })
})

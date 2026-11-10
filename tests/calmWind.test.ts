import { describe, expect, it } from 'vitest'
import { CALM_KT, calmDirection, isCalm, windWords } from '../src/lib/windNow.ts'
import { windTag } from '../src/core/briefing.ts'

/* Batch QA, Section 0B (field 10 Nov: "1 kt NNE cross-shore", then "2 kt SW offshore" nine minutes later). */
describe('calm has no direction', () => {
  const mps = (kt: number) => kt / 1.943844
  it('under 3 kt: "Calm", no direction, so no side to the beach and no arrow', () => {
    expect(CALM_KT).toBe(3)
    for (const kt of [0, 1, 2, 2.9]) {
      expect(isCalm(mps(kt))).toBe(true)
      expect(calmDirection(mps(kt), 20)).toBeNull()
      expect(windWords({ mps: mps(kt), fromDeg: calmDirection(mps(kt), 20), gustMps: null }, 'kt')).toBe('Calm')
      expect(windTag(calmDirection(mps(kt), 20), 100)).toBeNull()
    }
  })
  it('3 kt and over: the direction and its side stand', () => {
    expect(calmDirection(mps(3), 20)).toBe(20)
    expect(windWords({ mps: mps(8), fromDeg: 20, gustMps: null }, 'kt')).toBe('8 kt NNE')
    expect(windTag(calmDirection(mps(8), 280), 100)).toBe('Offshore')
  })
})

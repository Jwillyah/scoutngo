import { describe, expect, it } from 'vitest'
import { PHASE_AGREE, phaseApart, phaseBySuncalc, phaseBySynodic, tideWeek } from './moonTides.ts'

describe('the moon phase, two ways', () => {
  it('suncalc and the mean synodic month agree to within a day across 2026, every day', () => {
    let worst = 0
    for (let d = 0; d < 365; d += 1) {
      const at = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000)
      worst = Math.max(worst, phaseApart(phaseBySuncalc(at), phaseBySynodic(at)))
    }
    expect(worst).toBeLessThan(PHASE_AGREE)
  })

  it('says big tides near a full moon and small ones at a half moon', () => {
    /* A full moon from the synodic count: 0.5 of a month after a new moon. */
    const newMoon = Date.UTC(2000, 0, 6, 18, 14) + 330 * 29.530588853 * 86_400_000
    const full = new Date(newMoon + 0.5 * 29.530588853 * 86_400_000)
    expect(tideWeek(full)?.line).toBe('Big tides this week (full moon)')
    expect(tideWeek(new Date(newMoon))?.line).toBe('Big tides this week (new moon)')
    expect(tideWeek(new Date(newMoon + 0.25 * 29.530588853 * 86_400_000))?.line).toBe('Small tides this week (half moon)')
  })
})

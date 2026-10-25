import { getMoonPosition } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { getMoonArc } from './moonArc.ts'

describe('moonrise and moonset bearings', () => {
  const at = new Date('2026-10-25T21:00:00Z')
  const arc = getMoonArc(at, 36.84658, -75.97666)

  it('puts the moon on the horizon at its rise and set', () => {
    for (const e of [arc.rise, arc.set]) {
      if (e === null) continue
      expect(Math.abs(getMoonPosition(e.at, 36.84658, -75.97666).altitude)).toBeLessThan(1)
    }
    expect(arc.rise !== null || arc.set !== null).toBe(true)
  })

  it('rises in the east half and sets in the west half', () => {
    if (arc.rise !== null) expect(arc.rise.azimuth).toBeLessThan(180)
    if (arc.set !== null) expect(arc.set.azimuth).toBeGreaterThan(180)
  })
})

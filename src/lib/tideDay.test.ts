import { describe, expect, it } from 'vitest'
import { curveFromExtremes, type TideExtreme } from '../core/tide.ts'
import { tideDayModel } from './tideDay.ts'

/* Virginia Beach on 27 Oct, NOAA's turns (measurements/2026-10-27-tide-checks.md). */
const turns: TideExtreme[] = [
  { at: new Date('2026-10-26T19:40:00Z'), feet: 0.3, kind: 'low' },
  { at: new Date('2026-10-27T06:26:00Z'), feet: -0.02, kind: 'low' },
  { at: new Date('2026-10-27T12:51:00Z'), feet: 5.05, kind: 'high' },
  { at: new Date('2026-10-27T19:19:00Z'), feet: 0.11, kind: 'low' },
  { at: new Date('2026-10-28T01:13:00Z'), feet: 3.81, kind: 'high' },
  { at: new Date('2026-10-28T07:20:00Z'), feet: 0.2, kind: 'low' },
]

describe('the tide day curve', () => {
  const model = tideDayModel({ date: '2026-10-27', timeZone: 'America/New_York', curve: curveFromExtremes(turns), extremes: turns, lat: 36.84, lon: -75.97, width: 360, height: 140 })

  it("spans the venue's day and marks that day's four turns where they are", () => {
    expect(model).not.toBeNull()
    if (model === null) return
    expect(model.marks.map((m) => m.kind)).toEqual(['low', 'high', 'low', 'high'])
    /* 8:51 AM is 8.85 / 24 of the way across. */
    const high = model.marks[1]
    expect(high.x).toBeCloseTo((8.85 / 24) * 360, 0)
    /* The high is the top of the drawing, the lowest low near the bottom. */
    expect(high.y).toBeLessThan(model.marks[0].y)
    expect(model.tOf(model.xOf(high.at.getTime()))).toBeCloseTo(high.at.getTime(), -3)
  })

  it('marks sunrise and sunset, on the same minutes as the glass-morning strip', async () => {
    const { sunriseOn } = await import('../core/sunrise.ts')
    const rise = model?.sun.find((s) => s.kind === 'rise')
    expect(rise?.at.getTime()).toBe(sunriseOn('2026-10-27', 36.84, -75.97, 'America/New_York')?.getTime())
    expect(model?.sun.map((s) => s.kind)).toEqual(['rise', 'set'])
  })

  it('has day, golden and blue bands behind, in order through the morning', () => {
    const kinds = (model?.bands ?? []).map((b) => b.band)
    const golden = kinds.indexOf('golden')
    expect(golden).toBeGreaterThan(-1)
    expect(kinds.indexOf('blue')).toBeLessThan(golden)
    expect(kinds.indexOf('day')).toBeGreaterThan(golden)
  })
})

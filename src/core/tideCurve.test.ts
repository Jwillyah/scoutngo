import { describe, expect, it } from 'vitest'
import { curveFromExtremes, type TideExtreme } from './tide.ts'
import { hourTicks, tideCurveModel, timeAtFraction } from './tideCurve.ts'

/* A semidiurnal fixture: a low at 17:48 local (21:48Z), highs 6 h 12 min either side, in Virginia Beach (UTC-5 on 19 Nov). */
const NY = 'America/New_York'
const LOW = Date.UTC(2026, 10, 19, 22, 48)
const STEP = (6 * 60 + 12) * 60_000
const EXTREMES: TideExtreme[] = [-2, -1, 0, 1, 2].map((k) => ({ at: new Date(LOW + k * STEP), feet: k % 2 === 0 ? 0.8 : 3.4, kind: k % 2 === 0 ? ('low' as const) : ('high' as const) }))
const CURVE = curveFromExtremes(EXTREMES)
const NOW = new Date(LOW - 75 * 60_000)
const INPUT = { curve: CURVE, from: new Date(NOW.getTime() - 2 * 3_600_000), to: new Date(NOW.getTime() + 16 * 3_600_000), timeZone: NY, width: 330, height: 170, padTop: 26, padBottom: 30, axisRoom: 18 }

describe('the tide curve geometry', () => {
  it('the same input gives the same curve', () => {
    expect(tideCurveModel(INPUT)?.path).toBe(tideCurveModel({ ...INPUT })?.path)
  })
  it('the line goes down to the low and back up, and the low is the lowest point', () => {
    const m = tideCurveModel({ ...INPUT, marks: [{ at: new Date(LOW), kind: 'low' }] })!
    expect(m.marks).toHaveLength(1)
    const ys = [...m.path.matchAll(/,([\d.]+)/g)].map((x) => Number(x[1]))
    expect(Math.abs(m.marks[0].y - Math.max(...ys))).toBeLessThan(1)
    expect(m.marks[0].feet).toBeCloseTo(0.8, 1)
  })
  it('now sits at its share of the window, on the line', () => {
    const m = tideCurveModel({ ...INPUT, now: NOW })!
    expect(m.now!.x).toBeCloseTo((2 / 18) * 330, 1)
    expect(m.now!.feet).toBeGreaterThan(0.8)
    expect(m.now!.feet).toBeLessThan(3.4)
  })
  it('no now when it is outside the window', () => {
    expect(tideCurveModel({ ...INPUT, now: new Date(INPUT.to.getTime() + 1) })!.now).toBeNull()
  })
  it('a band is clamped to the window; an empty one is null', () => {
    const m = tideCurveModel({ ...INPUT, band: { from: new Date(NOW.getTime() - 5 * 3_600_000), to: new Date(NOW.getTime() + 1 * 3_600_000) } })!
    expect(m.band!.x0).toBe(0)
    expect(tideCurveModel({ ...INPUT, band: { from: new Date(INPUT.to.getTime() + 3_600_000), to: new Date(INPUT.to.getTime() + 7_200_000) } })!.band).toBeNull()
  })
  it('ticks fall on every sixth clock hour at the venue', () => {
    const t = hourTicks(INPUT.from, INPUT.to, NY)
    expect(t.length).toBeGreaterThanOrEqual(2)
    for (const at of t) expect([0, 6, 12, 18]).toContain(Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: NY }).format(at)))
  })
  it('a window the curve does not reach has no curve, never a flat line', () => {
    expect(tideCurveModel({ ...INPUT, from: new Date(Date.UTC(2030, 0, 1)), to: new Date(Date.UTC(2030, 0, 2)) })).toBeNull()
    expect(tideCurveModel({ ...INPUT, to: INPUT.from })).toBeNull()
  })
  it('a finger at a share of the window is that share of its time', () => {
    expect(timeAtFraction(INPUT.from, INPUT.to, 0.5).getTime()).toBe((INPUT.from.getTime() + INPUT.to.getTime()) / 2)
    expect(timeAtFraction(INPUT.from, INPUT.to, -1).getTime()).toBe(INPUT.from.getTime())
    expect(timeAtFraction(INPUT.from, INPUT.to, 9).getTime()).toBe(INPUT.to.getTime())
  })
})

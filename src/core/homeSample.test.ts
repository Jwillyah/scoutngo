import { describe, expect, it } from 'vitest'
import { getMoonIllumination, getPosition } from 'suncalc'
import { findAlignments } from './alignment.ts'
import { goldenNext } from './goldenNext.ts'
import { bearingBetween } from './geo.ts'
import { DASH, SAMPLE_PIER_END, SAMPLE_SPOT, lightBand, moonLine, skyFireLine, surfBand, tideBand, windBand } from './homeSample.ts'
import { surfEstimate } from './surf.ts'

/* The home page's words for the fixed sample beach (Batch F, Section 1). Fixtures only. */
const clock = (d: Date) => d.toISOString().slice(11, 16)

describe('the home page sample', () => {
  const now = new Date('2026-10-30T18:00:00Z')

  it('Light says the next golden light from the same arithmetic as the chip', () => {
    const g = goldenNext((t) => getPosition(t, SAMPLE_SPOT.lat, SAMPLE_SPOT.lon).altitude, now)
    expect(g.kind).toBe('next')
    const b = lightBand(g, now, clock)
    expect(b.word).toBe('golden')
    /* Sunset at the pier on 30 Oct is about 22:07 UTC; golden starts a bit under an hour before. */
    expect(b.value >= '21:00' && b.value <= '21:40').toBe(true)
  })

  it('Tide is the next turn after now, not the first of the day', () => {
    const ex = [
      { at: new Date('2026-10-30T12:00:00Z'), feet: 3, kind: 'high' as const },
      { at: new Date('2026-10-30T18:10:00Z'), feet: 0.2, kind: 'low' as const },
      { at: new Date('2026-10-31T00:20:00Z'), feet: 3.1, kind: 'high' as const },
    ]
    expect(tideBand(ex, now, clock)).toEqual({ value: '18:10', word: 'low' })
  })

  it('Surf is a range of whole feet from the breaking estimate', () => {
    const e = surfEstimate(0.8, 9, 95, 95)
    const b = surfBand(e)
    expect(b.value).toBe(`${Math.floor(e.faceFt)}–${Math.floor(e.faceFt) + 1} ft`)
  })

  it('Wind is knots and where it comes FROM, never where it goes', () => {
    /* 5.14 m/s is 10 kt; 247.5 is from west-southwest, a wind blowing TOWARD east-northeast. */
    expect(windBand({ speedMps: 5.14, fromDegrees: 247.5 })).toEqual({ value: '10 kt', word: 'from west-southwest' })
    expect(windBand({ speedMps: 5.14, fromDegrees: 67.5 }).word).toBe('from east-northeast')
  })

  it('anything that did not arrive is a dash, never a zero', () => {
    expect(lightBand(null, now, clock).value).toBe(DASH)
    expect(tideBand(null, now, clock).value).toBe(DASH)
    expect(tideBand([], now, clock).value).toBe(DASH)
    expect(surfBand(null).value).toBe(DASH)
    expect(windBand(null).value).toBe(DASH)
    expect(skyFireLine(null, null, null, null, clock)).toBeNull()
    expect(moonLine(null, null, clock, clock)).toBeNull()
  })

  it('Sky color says the real verdict and when to look', () => {
    const ev = new Date('2026-10-30T22:07:00Z')
    expect(skyFireLine('sunset', 'possible', ev, new Date('2026-10-30T21:50:00Z'), clock)).toBe('Tonight: possible from 21:50')
    /* Unlikely gets no "from": there is nothing to wait for, only the time of the event. */
    expect(skyFireLine('sunrise', 'unlikely', ev, new Date('2026-10-30T21:50:00Z'), clock)).toBe('Sunrise 22:07: unlikely')
  })

  it('the pier end lies east of the foot of the pier, and the finder finds a moonrise off it', () => {
    const b = bearingBetween(SAMPLE_SPOT, SAMPLE_PIER_END)
    expect(b).toBeGreaterThan(90)
    expect(b).toBeLessThan(100)
    const a = findAlignments({ observer: SAMPLE_SPOT, target: SAMPLE_PIER_END, body: 'moon', mode: 'rise', from: now, limit: 1 })[0]
    expect(a).toBeDefined()
    if (a === undefined) return
    expect(Math.abs(a.offsetDegrees)).toBeLessThan(1.3)
    const line = moonLine(a, getMoonIllumination(a.at).fraction, () => 'Tue', clock)
    expect(line).toMatch(/^(Full moon|Moon) rises off the pier end, Tue \d\d:\d\d$/)
  })
})

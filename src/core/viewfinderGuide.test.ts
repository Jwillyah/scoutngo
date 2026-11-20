import { describe, expect, it } from 'vitest'
import { project, visibleFov } from './arProjection.ts'
import { DOT_COUNT, facingView, headingOf, headingWords, stripTicks, sunDotTimes } from './viewfinderGuide.ts'

/* Batch SIMPLE-2, Section 4 (mockup Sky_Viewfinder): the compass strip, the sun's dots, the compass-only view. */
const FOV = visibleFov(390, 844)

describe('the compass strip', () => {
  it('reads where the middle of the picture looks, the calibration taken off', () => {
    expect(headingOf(null, FOV, 0)).toBeNull()
    expect(headingOf(facingView(247), FOV, 0)).toBeCloseTo(247, 4)
    expect(headingOf(facingView(247), FOV, 5)).toBeCloseTo(242, 4)
    expect(headingOf(facingView(2), FOV, 5)).toBeCloseTo(357, 4)
  })
  it('ticks either side, letters on the eight points, nothing under the middle', () => {
    const t = stripTicks(247)
    expect(t.map((x) => x.label)).toEqual(['210', 'SW', 'W', '285'])
    expect(t.find((x) => x.label === 'W')?.point).toBe(true)
    expect(t.every((x) => x.x >= 0 && x.x <= 1 && Math.abs(x.x - 0.5) >= 0.16)).toBe(true)
    expect(headingWords(247.4)).toBe('247° WSW')
  })
  it('wraps through north', () => {
    expect(stripTicks(5).map((x) => x.label)).toEqual(['330', '345', '30', 'NE'])
    expect(headingWords(359.7)).toBe('0° N')
  })
})

describe('the sun’s dots', () => {
  const event = new Date('2026-11-19T21:52:00Z')
  it('before a sunset: every 20 minutes up to it, the sunset last', () => {
    const d = sunDotTimes('sunset', event)
    expect(d).toHaveLength(DOT_COUNT)
    expect(d[DOT_COUNT - 1].getTime()).toBe(event.getTime())
    expect((d[1].getTime() - d[0].getTime()) / 60_000).toBe(20)
    expect(d[0].toISOString()).toBe('2026-11-19T20:32:00.000Z')
  })
  it('after a sunrise: the sunrise first', () => {
    const d = sunDotTimes('sunrise', event)
    expect(d[0].getTime()).toBe(event.getTime())
    expect(d[DOT_COUNT - 1].getTime()).toBeGreaterThan(event.getTime())
  })
})

describe('the compass-only view', () => {
  it('puts the event’s bearing in the middle, on the horizon', () => {
    const at = project(247, 0, facingView(247), FOV)!
    expect(at.x).toBeCloseTo(0.5, 4)
    expect(at.y).toBeCloseTo(0.5, 4)
    const left = project(230, 0, facingView(247), FOV)!
    expect(left.x).toBeLessThan(0.5)
  })
})

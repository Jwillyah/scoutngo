import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { minutesForDrag, timeBarModel } from './timeBar.ts'

/* Atlantic Park, 17:00 EDT on 25 October 2026: sunset sits inside the strip. */
const base = { at: new Date('2026-10-25T21:00:00Z'), width: 360, height: 100, lat: 36.84658, lon: -75.97666, timeZone: 'America/New_York', moon: false }

describe('the time bar', () => {
  it('puts the sunset mark where suncalc puts sunset, at one pixel a minute', () => {
    const model = timeBarModel(base)
    const set = model.marks.find((m) => m.body === 'sun' && m.kind === 'set')
    const sunset = getTimes(base.at, base.lat, base.lon).sunset!
    const expected = 180 + (sunset.getTime() - base.at.getTime()) / 60_000
    expect(set).toBeDefined()
    /* Five-minute samples, interpolated: within a pixel of the computed minute. */
    expect(Math.abs((set?.x ?? 0) - expected)).toBeLessThan(1)
  })

  it('labels the hours in the venue clock, not the device or UTC', () => {
    const labels = timeBarModel(base).ticks.filter((t) => t.major).map((t) => t.label)
    expect(labels).toContain('17:00')
    expect(labels).not.toContain('21:00')
  })

  it('runs golden then blue into the evening, in that order', () => {
    const order = timeBarModel(base).bands.map((b) => b.band)
    expect(order.indexOf('golden')).toBeGreaterThan(-1)
    expect(order.indexOf('golden')).toBeLessThan(order.indexOf('blue'))
  })

  it('drags the strip the way a ruler moves: left is later', () => {
    expect(minutesForDrag(-36, 360)).toBe(36)
    expect(minutesForDrag(36, 360)).toBe(-36)
  })

  it('draws the moon only when asked', () => {
    expect(timeBarModel(base).moonPath).toBeNull()
    expect(timeBarModel({ ...base, moon: true }).moonPath).toMatch(/^M/)
  })
})

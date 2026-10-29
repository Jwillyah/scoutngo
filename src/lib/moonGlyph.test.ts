import { describe, expect, it } from 'vitest'
import { moonLine, moonLitPath, moonPhaseName } from './moonGlyph.ts'

describe('the small moon', () => {
  it('draws nothing lit at new, and a whole disc at full', () => {
    expect(moonLitPath(0.005, 12)).toBeNull()
    /* At full the terminator is the far half of the circle: the lit part is the whole disc. */
    expect(moonLitPath(0.5, 12)).toBe('M 6 1 A 5 5 0 0 0 6 11 A 5 5 0 0 0 6 1 Z')
  })
  it('lights the right half at first quarter and the left at last', () => {
    expect(moonLitPath(0.25, 12)).toMatch(/^M 6 1 A 5 5 0 0 1 6 11/)
    expect(moonLitPath(0.75, 12)).toMatch(/^M 6 1 A 5 5 0 0 0 6 11/)
  })
  it('names the phase', () => {
    expect(moonPhaseName(0.62)).toBe('Waning gibbous')
    expect(moonPhaseName(0.1)).toBe('Waxing crescent')
    expect(moonPhaseName(0.5)).toBe('Full moon')
  })
})

describe('the moon in one line', () => {
  const clock = (t: Date) => t.toISOString().slice(11, 16)
  const at = new Date('2026-10-29T18:00:00Z')
  it('down: its phase, how lit, and when it rises', () => {
    expect(moonLine({ phase: 0.62, lit: 0.96, altitude: -10, rise: { at: new Date('2026-10-29T23:52:00Z') }, set: { at: new Date('2026-10-29T14:25:00Z') } }, at, clock)).toBe('Waning gibbous · 96% lit · rises 23:52')
  })
  it('up: when it sets; and no time at all rather than one that has passed', () => {
    expect(moonLine({ phase: 0.3, lit: 0.6, altitude: 20, rise: null, set: { at: new Date('2026-10-29T20:00:00Z') } }, at, clock)).toBe('Waxing gibbous · 60% lit · sets 20:00')
    expect(moonLine({ phase: 0.3, lit: 0.6, altitude: 20, rise: null, set: { at: new Date('2026-10-29T10:00:00Z') } }, at, clock)).toBe('Waxing gibbous · 60% lit')
  })
})

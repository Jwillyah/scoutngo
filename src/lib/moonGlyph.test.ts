import { describe, expect, it } from 'vitest'
import { moonLitPath, moonPhaseName } from './moonGlyph.ts'

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

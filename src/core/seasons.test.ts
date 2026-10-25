import { describe, expect, it } from 'vitest'
import { seasonLines } from './seasons.ts'

describe("the year's sun at one place", () => {
  const lines = seasonLines(2026, 36.84658, -75.97666, new Date('2026-10-25T16:00:00Z'))
  const day = (d: string) => lines.find((l) => l.day === d)

  it('finds the solstices within a day or two of the calendar dates', () => {
    expect(day('june-solstice')?.date.toISOString().slice(5, 10)).toMatch(/^06-(19|20|21|22|23)$/)
    expect(day('december-solstice')?.date.toISOString().slice(5, 10)).toMatch(/^12-(19|20|21|22|23)$/)
  })

  it('has the summer sun rise north of east and the winter sun south of it', () => {
    expect(day('june-solstice')?.sunrise ?? 90).toBeLessThan(90)
    expect(day('december-solstice')?.sunrise ?? 90).toBeGreaterThan(90)
  })

  it('has the equinox sun rise close to due east', () => {
    expect(Math.abs((day('march-equinox')?.sunrise ?? 0) - 90)).toBeLessThan(2)
    expect(day('september-equinox')?.date.getUTCMonth()).toBe(8)
  })
})

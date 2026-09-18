import { describe, expect, it } from 'vitest'
import { daysAhead, forecastKind, hourIndexFor } from './forecast.ts'

const NOW = new Date('2026-09-17T12:00:00Z')

describe('daysAhead', () => {
  it('counts whole days to the shoot', () => {
    expect(daysAhead(new Date('2026-09-17T23:00:00Z'), NOW)).toBe(0)
    expect(daysAhead(new Date('2026-09-20T00:00:00Z'), NOW)).toBe(3)
  })

  it('goes negative for a date already gone', () => {
    expect(daysAhead(new Date('2026-09-12T12:00:00Z'), NOW)).toBe(-5)
  })
})

/*
 * A past date is not a forecast, and calling it one would be a small lie in a
 * tool whose whole value is being right about things you cannot see yet.
 */
describe('forecastKind', () => {
  it('calls a future date a forecast', () => {
    expect(forecastKind(new Date('2026-09-20T12:00:00Z'), NOW)).toBe('forecast')
  })

  it('calls a past date recorded, not a forecast', () => {
    expect(forecastKind(new Date('2026-09-12T12:00:00Z'), NOW)).toBe('recorded')
  })

  it('treats today as a forecast, since the hours ahead are still to come', () => {
    expect(forecastKind(new Date('2026-09-17T08:00:00Z'), NOW)).toBe('forecast')
  })
})

describe('hourIndexFor', () => {
  const times = Array.from({ length: 24 }, (_, h) => `2026-09-20T${String(h).padStart(2, '0')}:00`)

  it('finds the exact hour of the shoot', () => {
    expect(hourIndexFor(times, '2026-09-20T13:00')).toBe(13)
    expect(hourIndexFor(times, '2026-09-20T00:00')).toBe(0)
  })

  it('falls back to the same hour on another day rather than to hour zero', () => {
    expect(hourIndexFor(times, '2026-09-21T13:00')).toBe(13)
  })

  it('never indexes off the end', () => {
    const index = hourIndexFor(['2026-09-20T00:00'], '2026-09-20T18:00')
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(1)
  })
})

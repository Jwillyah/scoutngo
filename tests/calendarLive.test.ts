import { describe, expect, it } from 'vitest'
import { WEEK_WORD, weekHeadline, weekPill } from '../src/core/homeDay.ts'
import { dayFull, filterEmpty, pastLines } from '../src/core/calendarV2.ts'
import type { CalendarDay } from '../src/core/calendarMonth.ts'

/*
 * THE CALENDAR AND THE WEEK (Batch LIVE, Section 3). 14 Nov: the week's
 * best line said "Tue fish" over a Tue pill saying "Calm"; the month had no
 * past and said nothing when a filter found nothing.
 */
describe('the week says one word per day', () => {
  it('the best line uses the pill\'s word', () => {
    const pill = weekPill('fish', null, false)!
    expect(pill.word).toBe(WEEK_WORD.fish)
    expect(weekHeadline([{ day: 'Tue', what: pill.word.toLowerCase() }])).toBe('Best this week: Tue calm')
  })
})

const day = (o: Partial<CalendarDay>): CalendarDay => ({
  date: '2026-11-12', inMonth: true, today: false, forecast: false, past: true, guess: false,
  sunrise: new Date('2026-11-12T11:38:00Z'), sunset: new Date('2026-11-12T21:56:00Z'),
  moon: { phase: 0.9, lit: 0.1, named: null }, marks: [],
  facts: { lowNearSunrise: null, lowNearSunset: null, windAtSunrise: null, surfFt: null, moonrise: null, moonset: null, meteor: null },
  ...o,
})
const dayOf = (t: Date) => t.toISOString().slice(0, 10)

describe('a past day says what happened, from this phone\'s logs', () => {
  it('fired, photos, a report', () => {
    const lines = pastLines('2026-11-12', dayOf, {
      photos: [{ at: new Date('2026-11-12T22:01:00Z'), outcome: 'fired' }, { at: new Date('2026-11-12T22:05:00Z'), outcome: null }],
      reports: [{ at: new Date('2026-11-12T13:00:00Z'), name: 'Sandbridge', size: '1–2 ft', rating: 'Fair' }],
    })
    expect(lines).toEqual(['The sky fired (your photos)', '2 photos logged', 'Your report: Sandbridge 1–2 ft, Fair'])
    expect(pastLines('2026-11-11', dayOf, { photos: [], reports: [] })).toEqual([])
  })
})

describe('the day card says the whole day', () => {
  it('sunrise and sunset, the tides, the moon', () => {
    const lines = dayFull(day({ past: false, forecast: true }), (t) => (t === null ? '—' : t.toISOString().slice(11, 16)), (m) => `${m} m/s`, [{ at: new Date('2026-11-12T15:00:00Z'), kind: 'high' }], { rise: 'color unlikely', set: 'color possible' }, 'Waning crescent')
    expect(lines[0]).toBe('Sunrise 11:38 · color unlikely · sunset 21:56 · color possible')
    expect(lines).toContain('Tides: high 15:00')
    expect(lines[lines.length - 1]).toMatch(/^Moon: Waning crescent, 10% lit/)
  })
})

describe('a filter with nothing ahead says so', () => {
  it('"none in the next 7 days"', () => {
    const days = [day({ past: false, forecast: true, today: true }), day({ date: '2026-11-13', past: false, forecast: true, moon: { phase: 0.5, lit: 1, named: 'full' } })]
    expect(filterEmpty(days, new Set(['surf', 'moon']))).toEqual(['surf'])
  })
})

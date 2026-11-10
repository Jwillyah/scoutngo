import { describe, expect, it } from 'vitest'
import type { CalendarDay } from '../src/core/calendarMonth.ts'
import { CAT_ORDER, dayCats, dayLines, GLASSY_KT, MAX_MARKS, shownCats } from '../src/core/calendarV2.ts'

/* Calendar v2 (Batch Pages, Section 4; board CalendarV2): computed marks, two a day at most, none past the forecast. */
const KT = 0.514444
const RISE = new Date('2026-11-09T11:36:00Z')
const SET = new Date('2026-11-09T21:59:00Z')
const day = (o: Omit<Partial<CalendarDay>, 'facts'> & { facts?: Partial<CalendarDay['facts']> }): CalendarDay => ({
  date: '2026-11-09',
  inMonth: true,
  today: true,
  forecast: true,
  past: false,
  sunrise: RISE,
  sunset: SET,
  moon: { phase: 0.3, lit: 0.6, named: null },
  marks: [],
  ...o,
  facts: { lowNearSunrise: null, lowNearSunset: null, windAtSunrise: null, surfFt: null, moonrise: null, moonset: null, meteor: null, ...o.facts },
})
const clock = (t: Date | null) => (t === null ? '—' : t.toISOString().slice(11, 16))
const speed = (mps: number) => `${Math.round(mps / KT)} kt`

describe('the marks', () => {
  it('Glassy is the wind at sunrise 5 kt or less, nothing else', () => {
    expect(GLASSY_KT).toBe(5)
    expect(dayCats(day({ facts: { windAtSunrise: { speedMps: 5 * KT, relation: 'onshore' } } }))).toEqual(['glassy'])
    expect(dayCats(day({ facts: { windAtSunrise: { speedMps: 5.6 * KT, relation: 'offshore' } } }))).toEqual([])
  })
  it('Low tide is a low within 90 minutes of sunrise or sunset (the month already found it)', () => {
    expect(dayCats(day({ facts: { lowNearSunset: new Date(SET.getTime() + 40 * 60_000) } }))).toEqual(['tide'])
  })
  it('in the order of importance: Surf, Sky color, Glassy, Low tide, Moon; two at most in the grid', () => {
    const all = day({ marks: ['surf', 'colour-set'], moon: { phase: 0.5, lit: 1, named: 'full' }, facts: { windAtSunrise: { speedMps: 2, relation: 'offshore' }, lowNearSunrise: RISE } })
    expect(dayCats(all)).toEqual([...CAT_ORDER])
    expect(shownCats(all, new Set())).toEqual(['surf', 'sky'])
    expect(MAX_MARKS).toBe(2)
  })
  it('a legend chip on shows only its kind', () => {
    const all = day({ marks: ['surf', 'colour-set'], facts: { lowNearSunrise: RISE } })
    expect(shownCats(all, new Set(['tide']))).toEqual(['tide'])
    expect(shownCats(all, new Set(['moon']))).toEqual([])
  })
  it('a day past the forecast carries no marks at all, not even the moon or the tide', () => {
    expect(dayCats(day({ forecast: false, moon: { phase: 0.5, lit: 1, named: 'full' }, facts: { lowNearSunrise: RISE } }))).toEqual([])
  })
})

describe('the day in words', () => {
  it('one line a kind, from the same facts, with times', () => {
    const lines = dayLines(day({ marks: ['surf'], moon: { phase: 0, lit: 0, named: 'new' }, facts: { surfFt: 2.6, windAtSunrise: { speedMps: 4 * KT, relation: 'offshore' }, lowNearSunrise: new Date(RISE.getTime() - 30 * 60_000) } }), clock, speed)
    expect(lines.map((l) => l.cat)).toEqual(['surf', 'glassy', 'tide', 'moon'])
    expect(lines[0].text).toBe('Surf 3 ft at sunrise 11:36')
    expect(lines[1].text).toBe('Glassy at sunrise 11:36 (wind 4 kt, offshore)')
    expect(lines[2].text).toBe('Low tide 11:06, 30 min before sunrise')
    expect(lines[3].text).toBe('New moon · a dark night')
  })
  it('nothing marked still says the sun; past the forecast says so', () => {
    expect(dayLines(day({}), clock, speed)[0].text).toBe('Nothing marked · sunrise 11:36 · sunset 21:59')
    expect(dayLines(day({ forecast: false }), clock, speed)[0].text).toMatch(/^Past the forecast/)
  })
})

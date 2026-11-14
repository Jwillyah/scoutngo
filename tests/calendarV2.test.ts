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
  guess: false,
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
  it('a day past the forecast week carries the moon and the tide, never surf, sky color or glassy (Batch LIVE, Section 3.1)', () => {
    expect(dayCats(day({ forecast: false, marks: ['surf', 'colour-set'], moon: { phase: 0.5, lit: 1, named: 'full' }, facts: { lowNearSunrise: RISE, windAtSunrise: { speedMps: 1, relation: 'offshore' } } }))).toEqual(['tide', 'moon'])
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

describe('never an event that has passed (Batch Flow, Section 4)', () => {
  it('today after sunrise, its sunrise lines go; the sunset ones stay', () => {
    const d = day({ marks: ['surf', 'colour-set'], facts: { windAtSunrise: { speedMps: 1, relation: 'offshore' }, lowNearSunset: new Date(SET.getTime() + 30 * 60_000) } })
    const after = new Date(RISE.getTime() + 3 * 3_600_000)
    expect(dayLines(d, clock, speed, after).map((l) => l.cat)).toEqual(['sky', 'tide'])
    expect(dayLines(d, clock, speed).map((l) => l.cat)).toEqual(['surf', 'sky', 'glassy', 'tide'])
  })
})

describe('forecast marks only a week out (Batch LIVE, Section 3.1)', () => {
  it('14 Nov: no sky color on 22 or 26 Nov, no glassy to 28 Nov; days 4 to 7 a guess', async () => {
    const { calendarMonth, FORECAST_DAYS } = await import('../src/core/calendarMonth.ts')
    const days = calendarMonth({
      year: 2026, month: 11, lat: 36.8435575, lon: -75.9713104, timeZone: 'America/New_York', today: '2026-11-14', forecastUntil: '2026-11-29', extremes: null,
      windAt: () => ({ speedMps: 1, fromDeg: 270 }), skyAt: () => ({ low: 0, mid: 50, high: 40 }), facing: 100, surfFtAt: () => null, milkyDates: new Set(),
    })
    const by = (d: string) => days.find((x) => x.date === d)!
    for (const d of ['2026-11-22', '2026-11-26', '2026-11-28']) expect(dayCats(by(d)).filter((c) => c === 'sky' || c === 'glassy')).toEqual([])
    expect(FORECAST_DAYS).toBe(7)
    expect(by('2026-11-20').forecast).toBe(true)
    expect(by('2026-11-21').forecast).toBe(false)
    expect(by('2026-11-16').guess).toBe(false)
    expect(by('2026-11-17').guess).toBe(true)
  })
})

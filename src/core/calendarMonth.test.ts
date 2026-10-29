import { describe, expect, it } from 'vitest'
import { getMoonIllumination } from 'suncalc'
import { bestTime, calendarMonth, FILTERS, type CalendarInput } from './calendarMonth.ts'
import { phaseBySynodic } from './moonTides.ts'

const VB = { lat: 36.8435575, lon: -75.9713104, timeZone: 'America/New_York' }
const none: Omit<CalendarInput, 'year' | 'month' | 'today'> = {
  ...VB,
  forecastUntil: null,
  extremes: null,
  windAt: () => null,
  skyAt: () => null,
  facing: 100,
  surfFtAt: () => null,
  milkyDates: new Set(),
}

describe('the month as a grid', () => {
  const days = calendarMonth({ ...none, year: 2026, month: 10, today: '2026-10-29' })
  it('runs Sunday to Saturday, whole weeks, with the month inside', () => {
    expect(days.length % 7).toBe(0)
    expect(new Date(`${days[0].date}T12:00:00Z`).getUTCDay()).toBe(0)
    expect(days.filter((d) => d.inMonth).map((d) => d.date)).toHaveLength(31)
    expect(days.find((d) => d.today)?.date).toBe('2026-10-29')
  })
  it('names one new moon and one full moon in October, about a fortnight apart', () => {
    const full = days.filter((d) => d.inMonth && d.moon.named === 'full')
    const nu = days.filter((d) => d.inMonth && d.moon.named === 'new')
    expect(full).toHaveLength(1)
    expect(nu).toHaveLength(1)
    const apart = Math.abs(Date.parse(full[0].date) - Date.parse(nu[0].date)) / 86_400_000
    expect(apart).toBeGreaterThanOrEqual(13)
    expect(apart).toBeLessThanOrEqual(16)
    /* And the named day is the one the lit fraction peaks on, give or take a day. */
    const brightest = days.filter((d) => d.inMonth).reduce((a, b) => (b.moon.lit > a.moon.lit ? b : a))
    expect(Math.abs(Date.parse(brightest.date) - Date.parse(full[0].date)) / 86_400_000).toBeLessThanOrEqual(1)
  })
  it('a day before today is past, not waiting for a forecast', () => {
    expect(days.find((d) => d.date === '2026-10-20')?.past).toBe(true)
    expect(days.find((d) => d.date === '2026-10-30')?.past).toBe(false)
  })
  it('says nothing that needs a forecast for a day without one', () => {
    for (const d of days) {
      expect(d.forecast).toBe(false)
      expect(d.marks.filter((m) => m.startsWith('glass') || m.startsWith('colour') || m === 'surf')).toEqual([])
    }
  })
})

/*
 * THE MOON'S PHASE, TWO WAYS. suncalc's illumination (an analytic ephemeris)
 * and a mean synodic month from a known new moon (src/core/moonTides.ts
 * phaseBySynodic, the same second way the Tide sheet's spring weeks use). They differ by up to about
 * 0.6 of a day, so they are held to name the same new and full moons within
 * a day, through a whole year.
 */
describe('the moon phase, two ways', () => {
  it('agree on every new and full moon of 2026 within a day', () => {
    const turns = (phaseAt: (t: Date) => number) => {
      const out: { kind: 'new' | 'full'; at: number }[] = []
      let prev = phaseAt(new Date(Date.UTC(2026, 0, 1)))
      for (let h = 1; h <= 366 * 24; h += 1) {
        const t = new Date(Date.UTC(2026, 0, 1) + h * 3_600_000)
        const p = phaseAt(t)
        /* A wrap, not a wobble: suncalc's phase steps back by a hair now and then. */
        if (p < prev - 0.5) out.push({ kind: 'new', at: t.getTime() })
        else if (prev < 0.5 && p >= 0.5 && p - prev < 0.25) out.push({ kind: 'full', at: t.getTime() })
        prev = p
      }
      return out
    }
    const a = turns((t) => getMoonIllumination(t).phase)
    const b = turns(phaseBySynodic)
    expect(a.length).toBeGreaterThanOrEqual(24)
    expect(b.length).toBe(a.length)
    for (const [i, x] of a.entries()) {
      expect(b[i].kind).toBe(x.kind)
      expect(Math.abs(b[i].at - x.at) / 86_400_000).toBeLessThan(1)
    }
  })
})

describe('marks', () => {
  const base = { ...none, year: 2026, month: 11, today: '2026-11-01', forecastUntil: '2026-11-10' }
  it('a light wind and clear low sky at sunrise is glass; the same with a forecast gap is nothing', () => {
    const days = calendarMonth({ ...base, windAt: () => ({ speedMps: 1, fromDeg: 280 }), skyAt: () => ({ low: 5, mid: 40, high: 30 }) })
    const d = days.find((x) => x.date === '2026-11-05')!
    expect(d.forecast).toBe(true)
    expect(d.marks).toContain('glass-rise')
    expect(d.marks).toContain('colour-rise')
    const past = days.find((x) => x.date === '2026-11-20')!
    expect(past.forecast).toBe(false)
    expect(past.marks).not.toContain('glass-rise')
  })
  it('a low tide 60 minutes after sunrise is marked, 120 is not', () => {
    const days = calendarMonth({ ...base, forecastUntil: null })
    const d = days.find((x) => x.date === '2026-11-05')!
    const at = (min: number) => [{ at: new Date(d.sunrise!.getTime() + min * 60_000), kind: 'low' as const }]
    expect(calendarMonth({ ...base, forecastUntil: null, extremes: at(60) }).find((x) => x.date === d.date)!.marks).toContain('tide-rise')
    expect(calendarMonth({ ...base, forecastUntil: null, extremes: at(120) }).find((x) => x.date === d.date)!.marks).not.toContain('tide-rise')
  })
  it('surf only where there is a beach, and only Fun or bigger', () => {
    const fun = calendarMonth({ ...base, surfFtAt: () => 3 }).find((x) => x.date === '2026-11-05')!
    expect(fun.marks).toContain('surf')
    expect(calendarMonth({ ...base, surfFtAt: () => 1.5 }).find((x) => x.date === '2026-11-05')!.marks).not.toContain('surf')
    expect(calendarMonth({ ...base, facing: null, surfFtAt: () => 3 }).find((x) => x.date === '2026-11-05')!.marks).not.toContain('surf')
  })
  it('the Leonids peak night is a meteor night', () => {
    const d = calendarMonth(base).find((x) => x.date === '2026-11-17')
    expect(d?.marks).toContain('meteor')
    expect(d?.facts.meteor).toMatch(/Leonid/)
  })
  it('plans a day at its morning when the morning is the good part', () => {
    const d = calendarMonth({ ...base, windAt: () => ({ speedMps: 1, fromDeg: 280 }), skyAt: () => ({ low: 5, mid: 0, high: 0 }) }).find((x) => x.date === '2026-11-05')!
    expect(bestTime(d)?.getTime()).toBe(d.sunrise?.getTime())
  })
  it('every filter names only marks that exist', () => {
    const all = new Set(['glass-rise', 'glass-set', 'colour-rise', 'colour-set', 'tide-rise', 'tide-set', 'surf', 'milky', 'meteor', 'supermoon', 'moon-by-sun'])
    for (const marks of Object.values(FILTERS)) for (const m of marks) expect(all.has(m)).toBe(true)
  })
})

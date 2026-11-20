import { describe, expect, it } from 'vitest'
import {
  BIG_MOONRISE_MINUTES,
  darkNights,
  milkyWayRow,
  moonMoments,
  moonNightTab,
  MOONSET_MIN_LIT,
  MOONSET_SUNRISE_MINUTES,
  nextPhases,
  nightRows,
  phaseStrip,
  tonightDate,
  tonightMoon,
  type BigMoonriseMoment,
  type MoonsetAtSunriseMoment,
} from './moonNights.ts'
import { formatClock, zonedTimeToUtc } from './timezone.ts'

/*
 * The Night tab's numbers at the Batch SIMPLE-2 fixture, Chic's Beach, from
 * the evening of Thu 19 Nov 2026. USNO's values these are held near are in
 * measurements/2026-11-19-moon-fixture.md; tests/moonFixture.test.ts holds the
 * underlying times to USNO's saved answers.
 */
const LAT = 36.92
const LON = -76.1
const TZ = 'America/New_York'
const at = (date: string, time: string) => zonedTimeToUtc(date, time, TZ)!
const clock = (d: Date) => formatClock(d, TZ, 12)
const THU_EVENING = at('2026-11-19', '19:00')
const minutes = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000

describe("tonight's moon", () => {
  it('Thu 19 Nov, 7 PM: up since 1:44 PM in the east, sets 2:13 AM in the W, about three quarters lit and waxing', () => {
    const m = tonightMoon(THU_EVENING, LAT, LON, TZ)
    expect(m.up).toBe(true)
    expect(m.waxing).toBe(true)
    expect(m.lit).toBeGreaterThan(0.7)
    expect(m.lit).toBeLessThan(0.8)
    expect(minutes(m.rise!.at, new Date('2026-11-19T18:44:00Z'))).toBeLessThan(5)
    expect(m.rise!.compass).toBe('E')
    expect(minutes(m.set!.at, new Date('2026-11-20T07:14:00Z'))).toBeLessThan(5)
    expect(m.set!.azimuth).toBeCloseTo(273.7, 0)
    expect(m.set!.compass).toBe('W')
  })

  it('waning after the full moon', () => {
    expect(tonightMoon(at('2026-11-27', '21:00'), LAT, LON, TZ).waxing).toBe(false)
  })
})

describe('tonightDate', () => {
  it('is yesterday before sunrise, today after it', () => {
    expect(tonightDate(at('2026-11-20', '03:00'), LAT, LON, TZ)).toBe('2026-11-19')
    expect(tonightDate(at('2026-11-20', '09:00'), LAT, LON, TZ)).toBe('2026-11-20')
  })
})

describe('the 14-night strip', () => {
  it('from Thu 19 Nov: fourteen nights, FULL on Tue 24 Nov, nothing else marked', () => {
    const s = phaseStrip(THU_EVENING, LAT, LON, TZ)
    expect(s).toHaveLength(14)
    expect(s[0].date).toBe('2026-11-19')
    expect(s[13].date).toBe('2026-12-02')
    expect(s.filter((n) => n.mark !== null).map((n) => [n.date, n.mark])).toEqual([['2026-11-24', 'full']])
    expect(s.slice(0, 5).every((n) => n.waxing)).toBe(true)
    expect(s.slice(5).every((n) => !n.waxing)).toBe(true)
  })

  it('marks NEW on Tue 8 Dec when the strip reaches it', () => {
    const s = phaseStrip(at('2026-12-01', '20:00'), LAT, LON, TZ)
    expect(s.filter((n) => n.mark !== null).map((n) => [n.date, n.mark])).toEqual([['2026-12-08', 'new']])
  })

  it('started before sunrise, begins with the night still running', () => {
    expect(phaseStrip(at('2026-11-20', '03:00'), LAT, LON, TZ)[0].date).toBe('2026-11-19')
  })
})

describe('moments', () => {
  const list = moonMoments(THU_EVENING, LAT, LON, TZ)
  const big = list.filter((m): m is BigMoonriseMoment => m.kind === 'big-moonrise')
  const sets = list.filter((m): m is MoonsetAtSunriseMoment => m.kind === 'moonset-at-sunrise')

  it('Tue 24 Nov is a Big moonrise: rises 4:38 PM ENE, 12 min before the 4:49 PM sunset (batch: 4:41 vs 4:46)', () => {
    expect(big.map((m) => m.date)).toEqual(['2026-11-24'])
    const m = big[0]
    expect(minutes(m.moonrise.at, new Date('2026-11-24T21:38:00Z'))).toBeLessThan(5)
    expect(minutes(m.sunset, new Date('2026-11-24T21:50:00Z'))).toBeLessThan(5)
    expect(m.minutesBeforeSunset).toBe(12)
    expect(Math.abs(m.minutesBeforeSunset)).toBeLessThanOrEqual(BIG_MOONRISE_MINUTES)
    expect(m.moonrise.azimuth).toBeCloseTo(56.6, 0)
    expect(m.moonrise.compass).toBe('ENE')
    expect(clock(m.moonrise.at)).toBe('4:38 PM')
  })

  it('Mon 23 Nov is NOT a Moonset at sunrise: lit enough, but it sets 5:44 AM, over an hour before the 6:51 AM sunrise', () => {
    expect(sets.some((m) => m.date === '2026-11-23')).toBe(false)
  })

  it('Tue 24 Nov is: sets 7:01 AM WNW, 9 min after sunrise, over 99% lit', () => {
    expect(sets.map((m) => m.date)).toEqual(['2026-11-24'])
    const m = sets[0]
    expect(clock(m.moonset.at)).toBe('7:01 AM')
    expect(m.moonset.compass).toBe('WNW')
    expect(m.minutesAfterSunrise).toBe(9)
    expect(Math.abs(m.minutesAfterSunrise)).toBeLessThanOrEqual(MOONSET_SUNRISE_MINUTES)
    expect(m.lit).toBeGreaterThanOrEqual(MOONSET_MIN_LIT)
  })

  it('in time order, and only ones still to come', () => {
    expect(list.map((m) => m.kind)).toEqual(['moonset-at-sunrise', 'big-moonrise'])
    const after = moonMoments(at('2026-11-24', '17:00'), LAT, LON, TZ)
    expect(after.some((m) => m.date === '2026-11-24')).toBe(false)
  })
})

describe('rows', () => {
  it('next full Tue 24 Nov 9:53 AM, next new Tue 8 Dec 7:51 PM (USNO 7:52)', () => {
    const p = nextPhases(THU_EVENING, TZ)
    expect(p.full.date).toBe('2026-11-24')
    expect(clock(p.full.at)).toBe('9:53 AM')
    expect(p.new.date).toBe('2026-12-08')
    expect(minutes(p.new.at, new Date('2026-12-09T00:52:00Z'))).toBeLessThan(1)
  })

  it('darkest nights: new moon ± 3, Dec 5–11; inside the run it starts tonight', () => {
    expect(darkNights(THU_EVENING, LAT, LON, TZ)).toMatchObject({ from: '2026-12-05', to: '2026-12-11' })
    expect(darkNights(at('2026-12-07', '21:00'), LAT, LON, TZ)).toMatchObject({ from: '2026-12-07', to: '2026-12-11' })
  })

  it('Milky Way: from the planner; not tonight in November, with a reason and the next night it is', () => {
    const r = milkyWayRow(THU_EVENING, LAT, LON, TZ)
    expect(r.tonight.window).toBeNull()
    expect(r.tonight.reason.length).toBeGreaterThan(0)
    expect(r.next).not.toBeNull()
    expect(r.next!.window).not.toBeNull()
    expect(r.next!.date > '2026-11-19').toBe(true)
  })

  it('next shower: the Geminids, the nights of Dec 13 and 14', () => {
    const s = nightRows(THU_EVENING, LAT, LON, TZ).shower
    expect(s?.shower.name).toBe('Geminids')
    expect(s?.nights).toEqual(['2026-12-13', '2026-12-14'])
  })
})

it('moonNightTab gathers the four parts', () => {
  const t = moonNightTab(THU_EVENING, LAT, LON, TZ)
  expect(t.strip).toHaveLength(14)
  expect(t.moments).toHaveLength(2)
  expect(t.rows.nextFull.date).toBe('2026-11-24')
  expect(t.tonight.up).toBe(true)
})

import { describe, expect, it } from 'vitest'
import type { TideExtreme } from '../core/tide.ts'
import { fishModel, fishWeek, fishWeekHero, moonLine, type FishInput } from './fishPage.ts'
import { DEFAULT_UNITS } from './units.ts'

/* Page_Fish with no computed window: the tide turn and the moon, nothing invented. Chic's Beach, Thu 19 Nov 2026. */
const NY = 'America/New_York'
const VB = { lat: 36.92, lon: -76.1 }
const H = 3_600_000
const LOW = Date.UTC(2026, 10, 19, 22, 48) // 5:48 PM EST
const NOW = new Date(LOW - 3 * H)
const EXT: TideExtreme[] = [
  { at: new Date(LOW - 6 * H), feet: 3.2, kind: 'high' },
  { at: new Date(LOW), feet: 0.8, kind: 'low' },
  { at: new Date(LOW + 6 * H), feet: 3.4, kind: 'high' },
]
const t0 = Math.floor(NOW.getTime() / H) * H
const base: FishInput = { now: NOW, venue: VB, timeZone: NY, units: DEFAULT_UNITS, extremes: EXT, month: null, extra: null, wind: null, facing: null, water: null }

describe('fishModel', () => {
  it('has no best window: the hero is the next tide turn and moonrise and moonset', () => {
    const m = fishModel(base)
    expect(m.best).toBeNull()
    expect(m.eyebrow).toBe('NEXT TIDE TURN')
    expect(m.value).toBe('Low 5:48p')
    expect(m.sub).toMatch(/^Moonrise \d{1,2}:\d{2}[ap] · moonset \d{1,2}:\d{2}[ap]$/)
  })
  it('marks every turn inside the curve’s window, with the clock the page uses', () => {
    const m = fishModel(base)
    expect(m.marks.map((x) => x.label)).toEqual(['low 5:48p', 'high 11:48p'])
    expect(m.window.to.getTime() - m.window.from.getTime()).toBe(14 * H)
  })
  it('without a tide table it leads with the moon, still no window', () => {
    const m = fishModel({ ...base, extremes: [] })
    expect(m.eyebrow).toBe('MOON')
    expect(m.value).toMatch(/^\d+% lit$/)
    expect(m.marks).toEqual([])
  })
  it('rows are Moon, Pressure, Water, Wind, and every unknown is a dash', () => {
    const m = fishModel(base)
    expect(m.rows.map((r) => r.label)).toEqual(['Moon', 'Pressure', 'Water', 'Wind'])
    expect(m.rows[1]).toMatchObject({ value: '—', detail: 'not said' })
    expect(m.rows[2]).toMatchObject({ value: '—', detail: 'no reading near here' })
    expect(m.rows[3]).toMatchObject({ value: '—', detail: 'not said' })
    expect(m.rows[0].value).toMatch(/^\d+%$/)
  })
  it('pressure in inches with its trend (3 hours ago against now), the water, the wind with its side', () => {
    const m = fishModel({
      ...base,
      extra: { times: [t0 - 3 * H, t0, t0 + H], values: { pressure_msl: [1020, 1016, 1016] } },
      wind: { times: [t0, t0 + H], values: { wind_speed_10m: [4.1, 4.1], wind_direction_10m: [22, 22] } },
      facing: 90,
      water: { site: { kind: 'coops' }, at: NOW, c: 14.4 } as unknown as FishInput['water'],
    })
    expect(m.rows[1]).toMatchObject({ value: '30.00 in', detail: 'falling' })
    expect(m.rows[2].value).toBe('58°')
    expect(m.rows[3].value).toBe('8 kt NNE')
    expect(m.rows[3].detail).toBe('cross-onshore')
  })
  it('metric: hPa, no "in"', () => {
    const m = fishModel({ ...base, units: { ...DEFAULT_UNITS, distance: 'm' }, extra: { times: [t0 - 3 * H, t0, t0 + H], values: { pressure_msl: [1016, 1016, 1016] } } })
    expect(m.rows[1]).toMatchObject({ value: '1016 hPa', detail: 'steady' })
  })
})

describe('moonLine', () => {
  it('says the next of rise and set that is still to come', () => {
    const m = moonLine(NOW, VB, NY)
    expect(m.next).toMatch(/^(rises|sets|rose|set) \d/)
  })
})

describe('the week', () => {
  const days = fishWeek(NOW, VB, NY, EXT)
  it('is seven days from today, each with the station’s turns that day', () => {
    expect(days).toHaveLength(7)
    expect(days[0].date).toBe('2026-11-19')
    expect(days[0].label).toBe('Thu 19')
    expect(days[0].tides).toEqual(['high 11:48a', 'low 5:48p', 'high 11:48p'])
    expect(days[1].tides).toEqual([])
    expect(days[3].tides).toEqual([])
  })
  it('the hero names the next full moon (Tue 24 Nov 2026)', () => {
    expect(fishWeekHero(NOW, NY).sub).toBe('Full moon Tue, Nov 24')
  })
})

import { describe, expect, it } from 'vitest'
import { curveFromExtremes, type TideExtreme } from '../core/tide.ts'
import type { Hourly } from './tideSheetData.ts'
import type { TideInfo } from './useTide.ts'
import type { TideSheetData } from './useTideSheet.ts'
import { DEFAULT_UNITS } from './units.ts'
import { tidePageModel } from './tidePage.ts'

/* Page_Tide: "Falling · Low 5:48p · 0.8 ft · then rising to 3.4 ft at 12:02 AM". A fixture, not an observation. */
const NY = 'America/New_York'
const VB = { lat: 36.92, lon: -76.1 }
const LOW = Date.UTC(2026, 10, 19, 22, 48) // 5:48 PM EST
const EXTREMES: TideExtreme[] = [
  { at: new Date(LOW - 6.2 * 3_600_000), feet: 3.2, kind: 'high' },
  { at: new Date(LOW), feet: 0.8, kind: 'low' },
  { at: new Date(LOW + 6.2 * 3_600_000), feet: 3.4, kind: 'high' },
  { at: new Date(LOW + 12.4 * 3_600_000), feet: 0.9, kind: 'low' },
]
const TIDE = { status: 'ok', station: { id: '8639208', name: 'Lynnhaven', at: { lat: 36.9, lon: -76.1 }, state: 'VA' }, distanceKm: 2, distant: false, predictions: { extremes: EXTREMES, curve: curveFromExtremes(EXTREMES), curveSource: 'derived', provenance: { kind: 'live' } } } as Extract<TideInfo, { status: 'ok' }>
const NO_MONTH: TideSheetData = {
  facing: { value: null, savedAt: null, status: 'ready' },
  month: { value: null, savedAt: null, status: 'ready' },
  wind: { value: null, savedAt: null, status: 'ready' },
  marine: { value: null, savedAt: null, status: 'ready' },
  seaM: { value: null, savedAt: null, status: 'ready' },
  buoy: null,
  buoys: null,
  surf: false,
}
const NOW = new Date(LOW - 75 * 60_000) // 4:33 PM
const model = (data = NO_MONTH, now = NOW) => tidePageModel({ now, tide: TIDE, data, venue: VB, timeZone: NY, units: DEFAULT_UNITS })

describe('the Tide page, as the tap-in skeleton says it', () => {
  it('which way the water is going, and the next turn', () => {
    const m = model()
    expect(m.eyebrow).toBe('Falling')
    expect(m.value).toBe('Low 5:48p')
    expect(m.shared).toEqual({ key: 'tide', value: 'low 5:48 pm' })
  })
  it('the sub line: the turn’s height, then the following turn', () => {
    expect(model().sub).toBe('0.8 ft · then rising to 3.4 ft at 12:00 AM')
  })
  it('rising before a high', () => {
    const m = model(NO_MONTH, new Date(LOW + 3 * 3_600_000))
    expect(m.eyebrow).toBe('Rising')
    expect(m.value).toMatch(/^High /)
    expect(m.sub).toContain('then falling to 0.9 ft')
  })
  it('the rows: next high, range, mirror morning, station; no more than five', () => {
    const r = model().rows
    expect(r.map((x) => x.label)).toEqual(['Next high', 'Range', 'Mirror morning', 'Station'])
    expect(r.length).toBeLessThanOrEqual(5)
    expect(r[0].detail).toBe('3.4 ft')
    expect(r[3]).toMatchObject({ value: 'Lynnhaven', detail: 'NOAA' })
  })
  it('the range is a dash when the day lacks a high and a low, and says neither spring nor neap without the station’s month', () => {
    const range = model().rows[1]
    expect(range.detail).toBeUndefined()
    expect(range.value).toMatch(/^(—|\d+\.\d ft)$/)
  })
  it('the mirror morning is a dash and "none forecast" when the wind forecast has none, never a made-up day', () => {
    expect(model().rows[2]).toMatchObject({ value: '—', detail: 'none forecast' })
  })
  it('a mirror morning, from the existing function: a low near sunrise and light wind', () => {
    /* The low at 7:43 AM on Wed 25 Nov (sunrise 6:56 AM there) with 1.5 m/s wind all month. */
    const low = new Date(Date.UTC(2026, 10, 25, 12, 43))
    const hours = Array.from({ length: 24 * 40 }, (_, i) => Date.UTC(2026, 10, 18) + i * 3_600_000)
    const wind: Hourly = { times: hours, values: { wind_speed_10m: hours.map(() => 1.5), wind_direction_10m: hours.map(() => 270) } }
    const data: TideSheetData = { ...NO_MONTH, month: { value: [{ at: low, feet: 0.2, kind: 'low' }], savedAt: null, status: 'ready' }, wind: { value: wind, savedAt: null, status: 'ready' } }
    const row = model(data).rows[2]
    expect(row.value).toBe('Wed 25')
    expect(row.detail).toBe('low 7:43a')
  })
  it('the marker is the next turn, in the clock formatter’s short words', () => {
    expect(model().marks).toEqual([{ at: new Date(LOW), kind: 'low', label: 'low 5:48p' }])
  })
  it('a finger on the curve says the height and the time under it', () => {
    expect(model().subAt(new Date(LOW))).toBe('0.8 ft at 5:48 PM')
  })
  it('never says safe, clear or legal', () => {
    const m = model()
    expect(JSON.stringify(m.rows) + m.sub + m.value).not.toMatch(/\b(safe|clear|legal)\b/i)
  })
})

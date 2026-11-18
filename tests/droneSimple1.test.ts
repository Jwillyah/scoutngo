import { describe, expect, it } from 'vitest'
import { DRONE_PLAN_TAB, DRONE_WIND_ROWS } from '../src/config/flags.ts'
import { droneTabFor, droneTabs } from '../src/core/dronePage.ts'
import { preflightRows, type PreflightInput } from '../src/core/dronePreflight.ts'
import type { AirspaceRead } from '../src/core/droneAirRead.ts'
import { dialRead } from '../src/core/calmDial.ts'
import { HELIPORT_NEAR_M, HELIPORT_ZOOM, heliportShown } from '../src/core/heliportRule.ts'
import { atMarker, liveCollection, TFR_NEAR_M, type FaaArea, type FaaLayers } from '../src/core/faaLive.ts'
import { tfrLine, tfrRead } from '../src/core/tfrLine.ts'

/* Batch SIMPLE-1, Section 1: the Drone page's three tabs, the dial, the heliport rule, the one TFR line and the Preflight checklist. */
const KT = 0.514444
const kt = (mps: number) => `${Math.round(mps / KT)} kt`
const NOW = new Date('2026-11-18T14:00:00Z')
const TZ = 'America/New_York'

describe('the flags', () => {
  it('the Plan tab and the Wind rows are off', () => {
    expect(DRONE_PLAN_TAB).toBe(false)
    expect(DRONE_WIND_ROWS).toBe(false)
  })
})

describe('the tabs', () => {
  it('are Wind, Airspace, Preflight; Plan only with its flag', () => {
    expect(droneTabs(false).map((t) => t.label)).toEqual(['Wind', 'Airspace', 'Preflight'])
    expect(droneTabs(true).map((t) => t.label)).toEqual(['Wind', 'Airspace', 'Preflight', 'Plan'])
  })
  it('maps the old ids: now and height to Wind, airspace to Airspace, plan to Preflight unless its flag is on', () => {
    expect(droneTabFor(undefined, false)).toBe('wind')
    expect(droneTabFor('now', false)).toBe('wind')
    expect(droneTabFor('height', true)).toBe('wind')
    expect(droneTabFor('airspace', false)).toBe('airspace')
    expect(droneTabFor('plan', false)).toBe('preflight')
    expect(droneTabFor('plan', true)).toBe('plan')
    expect(droneTabFor('preflight', false)).toBe('preflight')
  })
})

describe('the dial says Calm, never an empty circle', () => {
  it('calm under 3 kt, and when the shown speed rounds to 0', () => {
    expect(dialRead(1 * KT, 1, null)).toBe('calm')
    expect(dialRead(2.9 * KT, 3, 200)).toBe('calm')
    expect(dialRead(0.4, 0, 200)).toBe('calm')
    expect(dialRead(0, 0, null)).toBe('calm')
  })
  it('an arrow with a direction, a dash without one, and an unknown speed is never "calm"', () => {
    expect(dialRead(8 * KT, 8, 200)).toBe('arrow')
    expect(dialRead(8 * KT, 8, null)).toBe('none')
    expect(dialRead(null, null, null)).toBe('none')
    expect(dialRead(null, null, 120)).toBe('arrow')
  })
})

describe('heliport dots', () => {
  it('near the marker at any zoom, far away only from zoom 11', () => {
    expect(HELIPORT_NEAR_M).toBeCloseTo(8046.72, 1)
    expect(heliportShown(4000, 8)).toBe(true)
    expect(heliportShown(HELIPORT_NEAR_M, 8)).toBe(true)
    expect(heliportShown(HELIPORT_NEAR_M + 1, 10.9)).toBe(false)
    expect(heliportShown(HELIPORT_NEAR_M + 1, HELIPORT_ZOOM)).toBe(true)
    expect(heliportShown(500_000, 14)).toBe(true)
  })
  it('the map draws them by that rule', () => {
    const at = { lat: 36.85, lon: -75.98 }
    const near = { at: { lat: 36.86, lon: -75.98 }, name: 'Near', id: 'N' }
    const far = { at: { lat: 37.2, lon: -75.98 }, name: 'Far', id: 'F' }
    const layers: FaaLayers = { nsufr: null, fria: null, sua: null, tfr: null, heliport: [near, far] }
    const view = { south: 36, west: -77, north: 38, east: -75 }
    const on = { tfr: false, nsufr: false, fria: false, heliport: true, sua: false }
    const names = (zoom: number | undefined) => liveCollection(layers, view, on, '2026-11-18', zoom === undefined ? undefined : { marker: at, zoom }).features.map((f) => f.properties?.name)
    expect(names(9)).toEqual(['Near'])
    expect(names(11)).toEqual(['Near', 'Far'])
    expect(names(undefined)).toEqual(['Near', 'Far'])
  })
})

describe('the one TFR line', () => {
  const at = { lat: 36.85, lon: -75.98 }
  const sq = (lat: number, lon: number): FaaArea => ({ name: 'TFR 6/1', detail: 'x', rings: [[[lon - 0.05, lat - 0.05], [lon + 0.05, lat - 0.05], [lon + 0.05, lat + 0.05], [lon - 0.05, lat + 0.05], [lon - 0.05, lat - 0.05]]], bbox: [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05], fromIso: null, toIso: null })
  const arrived = Date.parse('2026-11-18T14:14:00Z')

  it('says the count, the radius and the fetch time in the venue zone', () => {
    const read = tfrRead({ data: [], at: arrived, from: 'live' }, at, '2026-11-18')
    expect(read).toMatchObject({ kind: 'ok', inside: 0, within: 0, radiusMi: 20 })
    expect(tfrLine(read, TZ, NOW)).toBe('TFRs today: 0 within 20 mi · from tfr.faa.gov at 9:14 AM · other NOTAMs not checked')
    expect(Math.round(TFR_NEAR_M / 1609.344)).toBe(20)
  })
  it('counts from the data, the ones over the point first', () => {
    const near = tfrRead({ data: [sq(36.95, -75.98)], at: arrived, from: 'live' }, at, '2026-11-18')
    expect(tfrLine(near, TZ, NOW)).toContain('TFRs today: 1 within 20 mi')
    const over = tfrRead({ data: [sq(36.85, -75.98)], at: arrived, from: 'live' }, at, '2026-11-18')
    expect(tfrLine(over, TZ, NOW)).toContain('1 over this point, 1 within 20 mi')
    const far = atMarker({ tfr: [sq(40, -100)], nsufr: null, fria: null, heliport: null, sua: null }, at, '2026-11-18')
    expect(far.tfrsToday?.near).toBe(0)
  })
  it('a failed or missing fetch says it could not check, never 0; a pending one says checking', () => {
    expect(tfrLine(tfrRead({ data: null, at: null, from: 'none' }, at, '2026-11-18'), TZ, NOW)).toBe("TFRs: couldn't check · other NOTAMs not checked")
    expect(tfrLine(tfrRead(null, at, '2026-11-18'), TZ, NOW)).toMatch(/^TFRs: checking/)
    expect(tfrLine({ kind: 'failed' }, TZ, NOW)).not.toMatch(/\b0\b/)
  })
  it('a kept copy says so, and another day carries its day', () => {
    const kept = tfrRead({ data: [], at: Date.parse('2026-11-17T14:14:00Z'), from: 'kept' }, at, '2026-11-18')
    expect(tfrLine(kept, TZ, NOW)).toBe('TFRs today: 0 within 20 mi · kept from tfr.faa.gov at Nov 17, 9:14 AM · other NOTAMs not checked')
  })
  it('never says the area is clear', () => {
    for (const r of [tfrRead({ data: [], at: arrived, from: 'live' }, at, '2026-11-18'), { kind: 'failed' } as const]) expect(tfrLine(r, TZ, NOW)).not.toMatch(/\b(clear|safe)\b/i)
  })
})

describe('the Preflight checklist', () => {
  const read = (over: Partial<AirspaceRead> = {}): AirspaceRead => ({ cls: 'C', ceilingFt: 100, icao: 'KORF', facility: 'Norfolk Intl', controlled: true, laanc: true, headline: '', row: { big: '', small: null }, ...over })
  const tfrOk = { kind: 'ok', inside: 0, within: 0, radiusMi: 20, at: Date.parse('2026-11-18T14:14:00Z'), kept: false } as const
  const base: PreflightInput = {
    air: read({ controlled: false, cls: null, ceilingFt: null }),
    marked: 0,
    mps400: 5 * KT,
    gust400: 8 * KT,
    limitMps: 23 * KT,
    speed: kt,
    ratedMin: 38,
    tempC: 22,
    temp: (c) => `${c}°C`,
    now: NOW,
    sunset: new Date('2026-11-18T22:00:00Z'),
    dusk: new Date('2026-11-18T22:30:00Z'),
    clock: (d) => d.toISOString().slice(11, 16),
    tfr: tfrOk,
    timeZone: TZ,
    fria: true,
    kp: 2,
    kpWord: () => 'quiet',
  }
  const tone = (i: PreflightInput, key: string) => preflightRows(i).find((r) => r.key === key)?.tone
  const line = (i: PreflightInput, key: string) => preflightRows(i).find((r) => r.key === key)?.line ?? ''

  it('has the eight rows, in order', () => {
    expect(preflightRows(base).map((r) => r.key)).toEqual(['airspace', 'wind', 'gusts', 'battery', 'sunset', 'tfr', 'remoteid', 'kp'])
  })
  it('all green when every fact was read and sits under its line', () => {
    expect(preflightRows(base).map((r) => r.tone)).toEqual(Array(8).fill('green'))
  })
  it('airspace: class, ceiling and LAANC are amber; unread is amber', () => {
    expect(tone({ ...base, air: read() }, 'airspace')).toBe('amber')
    expect(line({ ...base, air: read() }, 'airspace')).toBe('Class C · ceiling 100 ft · LAANC needed')
    expect(line({ ...base, air: read({ laanc: false }) }, 'airspace')).toContain('FAA authorization needed')
    expect(tone({ ...base, air: null }, 'airspace')).toBe('amber')
    expect(tone({ ...base, marked: 1 }, 'airspace')).toBe('amber')
    expect(tone({ ...base, marked: null }, 'airspace')).toBe('amber')
  })
  it('wind and gusts against the limit, unknown amber', () => {
    expect(tone({ ...base, mps400: 20 * KT }, 'wind')).toBe('amber')
    expect(tone({ ...base, mps400: null }, 'wind')).toBe('amber')
    expect(tone({ ...base, limitMps: null }, 'wind')).toBe('amber')
    expect(line({ ...base }, 'wind')).toBe('5 kt against your 23 kt limit')
    expect(tone({ ...base, gust400: 24 * KT }, 'gusts')).toBe('amber')
    expect(tone({ ...base, gust400: null }, 'gusts')).toBe('amber')
  })
  it('battery: cold trim and no temperature are amber', () => {
    expect(tone({ ...base, tempC: 2 }, 'battery')).toBe('amber')
    expect(line({ ...base, tempC: 2 }, 'battery')).toMatch(/^~\d+ min · 38 min rated/)
    expect(tone({ ...base, tempC: null }, 'battery')).toBe('amber')
  })
  it('sunset: under an hour, past, and missing are amber', () => {
    expect(tone({ ...base, sunset: new Date('2026-11-18T14:40:00Z') }, 'sunset')).toBe('amber')
    expect(tone({ ...base, sunset: new Date('2026-11-18T13:00:00Z') }, 'sunset')).toBe('amber')
    expect(tone({ ...base, sunset: null }, 'sunset')).toBe('amber')
    expect(line(base, 'sunset')).toContain('civil twilight ends 22:30')
  })
  it('TFRs: only an answered fetch with none near is green; the line is the one line', () => {
    expect(line(base, 'tfr')).toBe(tfrLine(tfrOk, TZ, NOW))
    expect(tone({ ...base, tfr: { ...tfrOk, within: 2 } }, 'tfr')).toBe('amber')
    expect(tone({ ...base, tfr: { ...tfrOk, inside: 1, within: 1 } }, 'tfr')).toBe('amber')
    expect(tone({ ...base, tfr: { kind: 'failed' } }, 'tfr')).toBe('amber')
    expect(tone({ ...base, tfr: { kind: 'checking' } }, 'tfr')).toBe('amber')
    expect(line({ ...base, tfr: { kind: 'failed' } }, 'tfr')).toContain("couldn't check")
  })
  it('Remote ID: green only inside a FRIA; unknown is amber', () => {
    expect(tone({ ...base, fria: false }, 'remoteid')).toBe('amber')
    expect(tone({ ...base, fria: 'unknown' }, 'remoteid')).toBe('amber')
  })
  it('Kp: 4 and over is amber; none received is amber', () => {
    expect(tone({ ...base, kp: 4 }, 'kp')).toBe('amber')
    expect(line({ ...base, kp: 5 }, 'kp')).toContain('can degrade GPS')
    expect(tone({ ...base, kp: null }, 'kp')).toBe('amber')
  })
  it('no row, in any state, says clear, safe, legal or cleared', () => {
    const states: PreflightInput[] = [base, { ...base, air: null, mps400: null, gust400: null, tfr: { kind: 'failed' }, fria: 'unknown', kp: null, sunset: null }, { ...base, air: read(), tempC: 0, kp: 6 }]
    for (const s of states) for (const r of preflightRows(s)) expect(r.line).not.toMatch(/\b(clear|safe|legal|cleared)\b/i)
  })
})

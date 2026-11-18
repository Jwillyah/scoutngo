import { describe, expect, it } from 'vitest'
import { atMarker, inArea, liveCollection, markerChips, markerHeadline, parseFria, parseHeliports, parseNsufr, parseSua, parseTfrs, tfrDates, tfrOn, type FaaLayers } from './faaLive.ts'

const PIER = { lat: 36.8436, lon: -75.9713 }
const square = (lon: number, lat: number, d: number) => [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]]
const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features })

/* As the FAA's services answer (properties checked against the live services, 16 Nov 2026). */
const NSUFR = fc([{ type: 'Feature', geometry: { type: 'Polygon', coordinates: square(-75.97, 36.84, 0.01) }, properties: { Base: 'Fixture Naval Station', Facility: 'VA1', Reason: 'National Security', Floor: 'Surface', Ceiling: "400' AGL" } }])
const FRIA = fc([{ type: 'Feature', geometry: { type: 'Polygon', coordinates: square(-76.2, 36.9, 0.005) }, properties: { title: 'Fixture Field FRIA', city: 'Norfolk', state: 'VA' } }])
const HELI = fc([
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-75.9846, 36.8521] }, properties: { IDENT: 'VA99', NAME: 'Fixture Hospital' } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-77, 38] }, properties: { IDENT: 'XX1', NAME: 'Far' } },
])
const SUA = fc([{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [square(-75.0, 36.8, 0.3)] }, properties: { NAME: 'W-72', TYPE_CODE: 'W', LOWER_VAL: '0', LOWER_UOM: 'FT', LOWER_CODE: 'SFC', TIMESOFUSE: 'INTERMITTENT' } }])
const TFR = (title: string, lon: number, lat: number) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: square(lon, lat, 0.02) }, properties: { NOTAM_KEY: '6/7890-1-FDC-F', TITLE: title, LEGAL: 'SECURITY' } })

describe('the FAA’s layers, read on the phone', () => {
  it('reads each dataset as the FAA answers it', () => {
    expect(parseNsufr(NSUFR)[0]).toMatchObject({ name: 'Fixture Naval Station', detail: "National Security · Surface to 400' AGL" })
    expect(parseFria(FRIA)[0]).toMatchObject({ name: 'Fixture Field FRIA', detail: 'Norfolk, VA' })
    expect(parseHeliports(HELI)).toHaveLength(2)
    expect(parseSua(SUA)[0]).toMatchObject({ name: 'W-72 (Warning area)', type: 'W' })
    expect(parseTfrs(fc([TFR('Las Vegas, NV, Thursday, November 19, 2026 through Saturday, November 21, 2026 Local', -115, 36)]))[0].name).toBe('TFR 6/7890 · security')
  })

  it('takes nothing that is not a shape', () => {
    expect(parseNsufr(null)).toEqual([])
    expect(parseNsufr(fc([{ geometry: null, properties: {} }]))).toEqual([])
    expect(parseHeliports(fc([{ geometry: { type: 'Point', coordinates: ['x', 1] } }]))).toEqual([])
  })

  it('reads a TFR title’s dates; one date runs until cancelled', () => {
    expect(tfrDates('GRANITE CITY, IL, Tuesday, November 17, 2026 through Wednesday, November 18, 2026 UTC')).toEqual({ fromIso: '2026-11-17', toIso: '2026-11-18' })
    expect(tfrDates('South Padre Island, TX, Tuesday, May 6, 2025 Local')).toEqual({ fromIso: '2025-05-06', toIso: null })
    expect(tfrDates('Key West, FL')).toEqual({ fromIso: null, toIso: null })
    const [t] = parseTfrs(fc([TFR('X, Tuesday, November 17, 2026 through Wednesday, November 18, 2026 UTC', 0, 0)]))
    expect(tfrOn(t, '2026-11-16')).toBe(false)
    expect(tfrOn(t, '2026-11-17')).toBe(true)
    expect(tfrOn(t, '2026-11-19')).toBe(false)
  })
})

describe('at the marker', () => {
  const layers: FaaLayers = {
    nsufr: parseNsufr(NSUFR),
    fria: parseFria(FRIA),
    heliport: parseHeliports(HELI),
    sua: parseSua(SUA),
    tfr: parseTfrs(fc([TFR('Near, Monday, November 16, 2026 Local', -76.05, 36.9), TFR('Over, Monday, November 16, 2026 through Tuesday, November 17, 2026 Local', -75.9713, 36.8436), TFR('Tomorrow, Tuesday, November 17, 2026 Local', -75.98, 36.85)])),
  }

  it('finds what holds the point, and the nearest heliport', () => {
    const m = atMarker(layers, PIER, '2026-11-16')
    expect(m.nsufr).toHaveLength(1)
    expect(m.fria).toBeNull()
    expect(m.sua).toHaveLength(0)
    expect(m.tfrsToday?.inside).toHaveLength(1)
    expect(m.tfrsToday?.near).toBe(2)
    expect(m.heliport !== null && m.heliport !== 'none' && m.heliport.point.id).toBe('VA99')
  })

  it('says each chip as a fact, and says when a layer has not arrived', () => {
    const chips = markerChips(atMarker(layers, PIER, '2026-11-16'), '4:53 PM').map((c) => c.text)
    expect(chips).toEqual(['Inside a TFR today', 'Heliport 0.9 mi', 'Remote ID needed', 'Sunset 4:53 PM'])
    const none = markerChips(atMarker({ nsufr: null, fria: null, heliport: null, sua: null, tfr: null }, PIER, '2026-11-16'), null).map((c) => c.text)
    expect(none).toEqual(["TFRs: couldn't check", 'Heliports not received', 'FRIAs not received'])
  })

  it('never says clear, safe or OK', () => {
    const words = [markerHeadline([], null), markerHeadline(['D'], 250), markerHeadline(['E'], null), ...markerChips(atMarker(layers, { lat: 40, lon: -100 }, '2026-11-16'), null).map((c) => c.text)].join(' ')
    expect(words).not.toMatch(/\b(clear|safe|ok)\b/i)
    expect(markerHeadline(['D'], 250)).toBe('Class D · max 250 ft here')
  })

  it('draws only what meets the view and is switched on; TFRs only today’s', () => {
    const view = { south: 36.7, west: -76.3, north: 37, east: -75.8 }
    const on = { nsufr: true, fria: true, heliport: true, sua: true, tfr: true }
    const all = liveCollection(layers, view, on, '2026-11-16').features.map((f) => f.properties?.kind)
    expect(all.filter((k) => k === 'tfr')).toHaveLength(2)
    expect(all).toContain('fria')
    expect(all.filter((k) => k === 'heliport')).toHaveLength(1)
    const off = liveCollection(layers, view, { ...on, fria: false, heliport: false }, '2026-11-16').features.map((f) => f.properties?.kind)
    expect(off).not.toContain('fria')
    expect(off).not.toContain('heliport')
  })

  it('a hole is not inside', () => {
    const ring = square(0, 0, 1)[0] as [number, number][]
    const hole = square(0, 0, 0.5)[0] as [number, number][]
    const a = { rings: [ring, hole], bbox: [-1, -1, 1, 1] as [number, number, number, number], name: 'x', detail: '' }
    expect(inArea(a, { lat: 0, lon: 0 })).toBe(false)
    expect(inArea(a, { lat: 0.75, lon: 0 })).toBe(true)
  })
})

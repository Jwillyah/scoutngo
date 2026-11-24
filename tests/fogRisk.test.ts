import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import type { CallRead } from '../src/core/briefing.ts'
import { ABOVE_FOG_LINE, fogAt, fogHours, fogLine, fogPhrase, fogSkyCall, fogWindows, metarAir, metarWeather, stationFog, type FogHour, type FogSpot } from '../src/core/fogRisk.ts'
import { skyCallNow, type SkyCall } from '../src/core/skyCall.ts'
import { BEACH, fogSpot, INLAND, TZ } from './wxFixture.ts'

/*
 * BATCH SIMPLE-3, SECTION 1: FOG. The rules on made-up hours first, then the
 * three field misses replayed from the archive (tests/data/wx-2026-11-21-24-vb,
 * measurements/2026-11-24-fog-fixtures.md): at the beach (Atlantic Park
 * Surf) and inland (Chesapeake), with only the station reports made by then.
 */

const T = new Date('2026-11-23T21:00:00Z')
const hour = (o: Partial<FogSpot['hours'][number]> = {}) => ({ at: T, tempC: 18, dewC: 16, windMps: 2, windFromDeg: 100, visibilityM: 16000, lowCloudPct: 10, midCloudPct: 10, precipMm: 0, ...o })
const spot = (o: Partial<FogSpot> = {}): FogSpot => ({ lat: 36.851, lon: -75.98, facingDeg: 100, waterC: 15, hours: [hour()], stations: [], ...o })

describe('the rules', () => {
  it('sea fog: the dew point at the water less 1 °F, onshore under 12 kt, at a beach', () => {
    const f = fogAt(spot(), T)
    expect(f.level).toBe('high')
    expect(f.kind).toBe('sea')
    expect(f.reasons.join(' ')).toMatch(/dew 61 °F \(forecast\) at or above the water 59 °F less 1/)
  })
  it('no sea fog offshore, or over 12 kt, or inland', () => {
    expect(fogAt(spot({ hours: [hour({ windFromDeg: 280 })] }), T).kind).not.toBe('sea')
    expect(fogAt(spot({ hours: [hour({ windMps: 7 })] }), T).kind).not.toBe('sea')
    expect(fogAt(spot({ facingDeg: null, waterC: null }), T).kind).not.toBe('sea')
  })
  it('radiation fog: within 2 °F, 4 kt or under, a clear-ish night', () => {
    const night = new Date('2026-11-21T08:00:00Z')
    const s = spot({ facingDeg: null, waterC: null, hours: [hour({ at: night, tempC: 5, dewC: 4.2, windMps: 1, visibilityM: null })] })
    expect(fogAt(s, night)).toMatchObject({ level: 'high', kind: 'radiation' })
    /* Under a low deck, or at midday, it does not form. */
    expect(fogAt({ ...s, hours: [hour({ at: night, tempC: 5, dewC: 4.2, windMps: 1, lowCloudPct: 90 })] }, night).level).toBe('low')
    const noon = new Date('2026-11-21T17:00:00Z')
    expect(fogAt({ ...s, hours: [hour({ at: noon, tempC: 5, dewC: 4.2, windMps: 1 })] }, noon).level).toBe('low')
  })
  it('a missing number is "could not say", never "no fog"', () => {
    expect(fogAt(spot({ facingDeg: null, waterC: null, hours: [hour({ dewC: null })] }), T).level).toBeNull()
    expect(fogAt(spot({ hours: [] }), T).level).toBeNull()
  })
  it('a station reporting fog within 15 mi confirms it, whatever the rules said; rain with low visibility does not', () => {
    const at = new Date('2026-11-23T13:40:00Z')
    const fg = stationFog('KNTU 231335Z 26005KT 1/2SM FG OVC002 16/16 A2996 RMK AO2 T01610161', { id: 'KNTU', km: 5.8, onWater: false }, at)
    const ra = stationFog('KNTU 231335Z 26005KT 1SM +RA OVC010 16/14 A2996', { id: 'KNTU', km: 5.8, onWater: false }, at)
    const dry = spot({ hours: [hour({ at, windFromDeg: 280 })] })
    expect(fogAt({ ...dry, stations: [fg as NonNullable<typeof fg>] }, at)).toMatchObject({ level: 'high', kind: 'reported' })
    expect(fogAt({ ...dry, stations: [ra as NonNullable<typeof ra>] }, at).level).toBe('low')
    /* Over 15 mi it says nothing here. */
    expect(fogAt({ ...dry, stations: [{ ...(fg as NonNullable<typeof fg>), km: 30 }] }, at).level).toBe('low')
  })
  it('every visibility 6 mi or more steps radiation fog down; sea fog only a station on the water can', () => {
    const night = new Date('2026-11-21T08:00:00Z')
    const s = spot({ facingDeg: null, waterC: null, hours: [hour({ at: night, tempC: 5, dewC: 4.2, windMps: 1, visibilityM: 16000 })] })
    expect(fogAt(s, night).level).toBe('moderate')
    const clearAirport = stationFog('KNTU 232056Z 10003KT 10SM FEW024 19/17 A2993', { id: 'KNTU', km: 5.8, onWater: false }, T)
    const clearPier = { ...(clearAirport as NonNullable<typeof clearAirport>), id: 'PIER', onWater: true }
    expect(fogAt(spot({ stations: [clearAirport as NonNullable<typeof clearAirport>] }), T).level).toBe('high')
    expect(fogAt(spot({ stations: [clearPier] }), T).level).toBe('moderate')
  })
  it('reads a METAR the way the rules need it', () => {
    expect(metarAir('KNTU 211056Z 02003KT 10SM SCT250 05/04 A3026 RMK AO2 SLP250 T00500044')).toEqual({ tempC: 5, dewC: 4.4 })
    expect(metarAir('KXYZ 211056Z 02003KT 10SM CLR M01/M03 A3026')).toEqual({ tempC: -1, dewC: -3 })
    expect(metarWeather('KNTU 211156Z 02003KT 8SM MIFG SCT200 07/07 A3028 RMK AO2')).toBe('MIFG')
    expect(metarWeather('KORF 240436Z 02016G25KT 9SM -RA BKN030 13/12 A3006 RMK AO2 RAB17')).toBe('-RA')
    expect(metarWeather('KCPK 211015Z AUTO 00000KT 10SM CLR 00/M01 A3028')).toBeNull()
  })
})

describe('the line and the windows', () => {
  const h = (iso: string, level: FogHour['level'], kind: FogHour['kind'] = level === 'low' ? null : 'radiation'): FogHour => ({ at: new Date(iso), level, kind, reasons: [], visMi: null, coastal: false })
  const night = ['2026-11-25T09:00:00Z', '2026-11-25T10:00:00Z', '2026-11-25T11:00:00Z', '2026-11-25T12:00:00Z', '2026-11-25T13:00:00Z']
  it('"Fog likely 5–9 AM": the run of high hours, to the end of the last', () => {
    const ahead = [h('2026-11-25T08:00:00Z', 'low'), ...night.map((t) => h(t, 'high')), h('2026-11-25T14:00:00Z', 'low')]
    expect(fogWindows(ahead)).toHaveLength(1)
    expect(fogPhrase(h('2026-11-25T02:00:00Z', 'low'), ahead, TZ)).toBe('Fog likely 4–9 AM')
  })
  it('"Fog possible …" for a moderate run, "Fog now", "Fog on the beach", and nothing to say', () => {
    expect(fogPhrase(h('2026-11-25T02:00:00Z', 'low'), night.map((t) => h(t, 'moderate')), TZ)).toBe('Fog possible 4–9 AM')
    expect(fogPhrase(h('2026-11-25T10:00:00Z', 'high'), [], TZ)).toBe('Fog now')
    expect(fogPhrase({ ...h('2026-11-25T10:00:00Z', 'high', 'sea'), coastal: true }, [], TZ)).toBe('Fog on the beach')
    expect(fogPhrase(h('2026-11-25T02:00:00Z', 'low'), night.map((t) => h(t, 'low')), TZ)).toBeNull()
  })
})

/* ---------------------------------------------------------- the fixtures */

const read = (kind: 'sunrise' | 'sunset', event: Date, call: CallRead['call']): CallRead => ({ kind, event, call, why: 'Likely: the models see a lit layer.', confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 4, of: 5 })
function callAt(kind: 'sunrise' | 'sunset', event: Date, call: CallRead['call']): SkyCall {
  const c = skyCallNow([{ events: { sunrise: kind === 'sunrise' ? event : null, sunset: kind === 'sunset' ? event : null }, reads: { sunrise: kind === 'sunrise' ? read(kind, event, call) : null, sunset: kind === 'sunset' ? read(kind, event, call) : null } }], new Date(event.getTime() - 3_600_000), BEACH)
  if (c === null) throw new Error('no call')
  return c
}

describe('21 Nov, 6:30-7:30 AM: fog and a good sunrise', () => {
  const sunrise = getTimes(new Date('2026-11-21T17:00:00Z'), BEACH.lat, BEACH.lon).sunrise as Date
  it('the beach shows fog through the hour (KNTU within 1 °F of its dew point, calm and clear; shallow fog, MIFG, at 6:56)', () => {
    for (const iso of ['2026-11-21T11:30:00Z', '2026-11-21T12:00:00Z', '2026-11-21T12:30:00Z']) {
      const now = new Date(iso)
      const f = fogAt(fogSpot(BEACH, now), now)
      expect(f.kind, iso).toBe('radiation')
      expect(f.level === 'high' || f.level === 'moderate', iso).toBe(true)
      expect(fogLine(fogSpot(BEACH, now), now, TZ).line, iso).toMatch(/^Fog (now|possible now)$/)
    }
    const seen = new Date('2026-11-21T12:00:00Z')
    expect(fogAt(fogSpot(BEACH, seen), seen).reasons.join(' ')).toMatch(/KNTU 8 mi MIFG/)
  })
  it('the sunrise call stands at the beach and inland: radiation fog lies under the sky', () => {
    for (const p of [BEACH, INLAND]) {
      const got = fogSkyCall(callAt('sunrise', sunrise, 'Go'), fogSpot(p, sunrise))
      expect(got.dropped, p.name).toBe(false)
      expect(got.call.call).toBe('Go')
      expect(got.line).toBeNull()
    }
  })
})

describe('23 Nov, 11 AM: the morning fog, then haze', () => {
  const now = new Date('2026-11-23T16:00:00Z')
  it('the morning shows fog at the beach until 10 AM (KNTU 1/2 mi FG at 8:35, the forecast under 1/4 mi); at 11 AM the stations read 10 mi with no fog or mist, and the archive has no fog then', () => {
    const s = fogSpot(BEACH, now)
    const morning = fogHours(s).filter((h) => h.at.getTime() >= Date.parse('2026-11-23T06:00:00Z') && h.at.getTime() <= now.getTime())
    const w = fogWindows(morning)
    expect(w).toHaveLength(1)
    expect(w[0].to.toISOString()).toBe('2026-11-23T15:00:00.000Z')
    expect(w[0].from.getTime()).toBeLessThanOrEqual(Date.parse('2026-11-23T13:00:00Z'))
    expect(fogAt(s, now).level).toBe('low')
  })
})

describe('23 Nov, 4:20-4:55 PM: sea fog on the beach, colour inland', () => {
  const sunset = getTimes(new Date('2026-11-23T17:00:00Z'), BEACH.lat, BEACH.lon).sunset as Date
  it('the beach says "Fog on the beach" through the half hour: dew 62 °F over 59 °F water, a light onshore wind', () => {
    for (let m = 20; m <= 55; m += 5) {
      const now = new Date(Date.parse('2026-11-23T21:00:00Z') + m * 60_000)
      const got = fogLine(fogSpot(BEACH, now), now, TZ)
      expect(got.now.kind, now.toISOString()).toBe('sea')
      expect(got.line, now.toISOString()).toBe('Fog on the beach')
    }
  })
  it('inland has no fog then', () => {
    const now = new Date('2026-11-23T21:30:00Z')
    expect(fogAt(fogSpot(INLAND, now), now).level).toBe('low')
  })
  it('the beach call drops a step and points inland; the inland call stands', () => {
    const beach = fogSkyCall(callAt('sunset', sunset, 'Go'), fogSpot(BEACH, sunset))
    expect(beach.dropped).toBe(true)
    expect(beach.call.call).toBe('Maybe')
    expect(beach.call.word).toBe('color possible')
    /* The call and its read say the same thing (docs/failure-modes.md, A). */
    expect(beach.call.read?.call).toBe('Maybe')
    expect(beach.call.read?.why).toMatch(/^Fog on the beach at the sunset/)
    expect(beach.line).toBe(ABOVE_FOG_LINE)
    expect(fogSkyCall(callAt('sunset', sunset, 'Maybe'), fogSpot(BEACH, sunset)).call.call).toBe('Skip')
    const inland = fogSkyCall(callAt('sunset', sunset, 'Go'), fogSpot(INLAND, sunset))
    expect(inland.dropped).toBe(false)
    expect(inland.call.call).toBe('Go')
  })
})

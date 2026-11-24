import { describe, expect, it } from 'vitest'
import { dbzAt, radarMotion, radarSample, rainBars, rainNow, rainPhrase, type RadarSample } from '../src/core/rainNow.ts'
import { BEACH, gridAt, quartersOf, radarAt, rainStations, TZ } from './wxFixture.ts'

/*
 * BATCH SIMPLE-3, SECTION 1b: RAIN NOW. The phrases on made-up reads, then
 * 23 Nov at 11:14 PM replayed at the beach from the archive (tests/data/
 * wx-2026-11-21-24-vb, measurements/2026-11-24-fog-fixtures.md).
 */

const NOW = new Date('2026-11-24T04:14:00Z')
const q = (min: number, mm: number | null) => ({ at: new Date(NOW.getTime() + min * 60_000), mm })
const radar = (o: Partial<RadarSample> = {}): RadarSample => ({ at: new Date('2026-11-24T04:10:00Z'), spotDbz: null, upstreamDbz: null, nearest: null, motion: { towardDeg: 45, kmh: 26.8 }, ...o })

describe('the phrases', () => {
  it('"Light rain now · ends ~…": a station within 15 mi reporting -RA, the end from the forecast\'s first dry quarter hour', () => {
    const r = rainNow({ now: NOW, stations: [{ id: 'KNTU', km: 5.8, at: new Date('2026-11-24T03:56:00Z'), wx: '-RA BR' }], radar: null, quarters: [q(1, 0.2), q(16, 0.1), q(31, 0), q(46, 0)] })
    expect(r.state).toBe('raining')
    expect(rainPhrase(r, TZ)).toBe('Light rain now · ends ~11:30 PM')
  })
  it('"ends by ~11:50 PM": rain on radar here, dry 10 mi upstream, the gap 36 minutes away at 27 km/h', () => {
    const r = rainNow({ now: NOW, stations: [], radar: radar({ spotDbz: 24 }), quarters: [] })
    expect(rainPhrase(r, TZ)).toBe('Light rain now · ends by ~11:50 PM')
  })
  it('"Rain starts ~2:15 PM · light" from the forecast\'s first wet quarter hour', () => {
    const at = new Date('2026-11-24T18:40:00Z')
    const quarters = [0, 15, 30, 45, 60].map((m, i) => ({ at: new Date(Date.parse('2026-11-24T19:00:00Z') + m * 60_000), mm: i < 2 ? 0 : 0.3 }))
    const r = rainNow({ now: at, stations: [], radar: null, quarters })
    expect(rainPhrase(r, TZ)).toBe('Rain starts ~2:15 PM · light')
  })
  it('"Showers nearby · moving NE": rain within 15 mi, neither here nor upstream', () => {
    const r = rainNow({ now: NOW, stations: [], radar: radar({ nearest: { km: 12, bearingDeg: 300 } }), quarters: [q(1, 0)] })
    expect(rainPhrase(r, TZ)).toBe('Showers nearby · moving NE')
  })
  it('a station report over 75 minutes old, or over 15 mi away, says nothing; nothing read is "unknown", not dry', () => {
    expect(rainNow({ now: NOW, stations: [{ id: 'KNTU', km: 5.8, at: new Date('2026-11-24T02:50:00Z'), wx: '-RA' }], radar: null, quarters: [q(1, 0)] }).state).toBe('dry')
    expect(rainNow({ now: NOW, stations: [{ id: 'KPVG', km: 42, at: NOW, wx: 'RA' }], radar: null, quarters: [q(1, 0)] }).state).toBe('dry')
    expect(rainNow({ now: NOW, stations: [], radar: null, quarters: [] })).toMatchObject({ state: 'unknown' })
    expect(rainPhrase(rainNow({ now: NOW, stations: [], radar: null, quarters: [] }), TZ)).toBeNull()
  })
  it('eight 15-minute bars for the next two hours', () => {
    const quarters = Array.from({ length: 16 }, (_, i) => ({ at: new Date(Date.parse('2026-11-24T04:00:00Z') + i * 900_000), mm: i === 3 ? 1 : 0 }))
    const bars = rainBars(quarters, NOW)
    expect(bars).toHaveLength(8)
    expect(bars[0].to.toISOString()).toBe('2026-11-24T04:15:00.000Z')
    expect(bars[2].intensity).toBe('moderate')
  })
})

describe('23 Nov, 11:14 PM at the beach, from the archive', () => {
  it('the radar moved the rain south at about 8 km/h; nothing over the beach or 10 mi up; the nearest rain 5 mi NE: "Showers nearby · moving S"', async () => {
    const scan = new Date('2026-11-24T04:10:00Z')
    const r = await radarAt(BEACH, scan)
    const g = await gridAt(BEACH, scan)
    expect(r?.scans).toBe(3)
    expect(g).not.toBeNull()
    const motion = radarMotion(r?.tracks ?? [])
    expect(motion?.towardDeg).toBeGreaterThan(170)
    expect(motion?.towardDeg).toBeLessThan(190)
    const sample = radarSample(g!, BEACH, scan, r?.tracks ?? [])
    expect(sample.spotDbz).toBeNull()
    expect(sample.upstreamDbz).toBeNull()
    expect(sample.nearest?.km).toBeLessThan(10)
    const got = rainNow({ now: NOW, stations: rainStations(BEACH, NOW), radar: sample, quarters: quartersOf(BEACH) })
    /*
     * Not "Light rain now": no station within 15 mi reported rain by 11:14
     * PM (KORF began at 11:17), the composite has no echo over Atlantic Park
     * from 11:10 PM to midnight, and the archived forecast's minutely_15 is
     * dry. The rain Jwilly was told of was nearby, not here (the measurement
     * file says so).
     */
    expect(got.state).toBe('nearby')
    expect(rainPhrase(got, TZ)).toBe('Showers nearby · moving S')
    expect(got.bars).toHaveLength(8)
  })
  it('and none came: no echo over the beach on any scan to midnight (the recorded centre tiles)', async () => {
    let read = 0
    for (const m of [20, 30, 40, 50, 60]) {
      const g = await gridAt(BEACH, new Date(Date.parse('2026-11-24T04:00:00Z') + m * 60_000))
      expect(g, `${m}`).not.toBeNull()
      read += 1
      expect(dbzAt(g!, BEACH)).toBeNull()
    }
    expect(read).toBe(5)
  })
})

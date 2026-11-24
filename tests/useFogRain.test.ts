import { describe, expect, it } from 'vitest'
import { distanceMeters } from '../src/core/geo.ts'
import { fogLine } from '../src/core/fogRisk.ts'
import { fogRainFrom, fogStationsOf, type FogRainIn } from '../src/lib/useFogRain.ts'
import type { StationReport } from '../src/lib/useStationObs.ts'
import { BEACH, fogSpot, hourlyOf, INLAND, metars, quartersOf, radarAt, TZ, waterAt, type Place } from './wxFixture.ts'

/*
 * BATCH SIMPLE-3, SECTIONS 1 AND 1b: THE ONE HOOK'S ASSEMBLY (src/lib/
 * useFogRain.ts fogRainFrom), replayed on the 21-24 Nov Virginia Beach
 * recording (tests/wxFixture.ts). The hook hands the rules exactly what the
 * phone holds: the brief's hours and quarters, the water, the facing, the
 * airports' raw METARs as the station store keeps them, the radar's scan.
 * Its fog must be the rules' own fog for the same inputs (one source), and
 * its rain the field fixture's.
 */

/** The airports' reports by `now`, as src/lib/useStationObs.ts keeps them (raw METAR, km, time). */
function reportsAt(p: Place, now: Date): StationReport[] {
  return metars()
    .filter((m) => m.valid.getTime() <= now.getTime())
    .map((m) => ({ id: m.id, km: distanceMeters(p, m.at) / 1000, at: m.valid, raw: m.raw }))
}

function input(p: Place, now: Date, o: Partial<FogRainIn> = {}): FogRainIn {
  return { spot: p, now, timeZone: TZ, wx: hourlyOf(p), quarters: quartersOf(p), facing: p.facing, waterC: p.facing === null ? null : waterAt(now), reports: reportsAt(p, now), radar: null, settled: true, ...o }
}

describe('the assembly', () => {
  it('hands the fog rules the same spot the fixture builds: the same line, the same fog now', () => {
    for (const iso of ['2026-11-21T11:30:00Z', '2026-11-21T12:30:00Z', '2026-11-23T16:00:00Z', '2026-11-23T21:30:00Z']) {
      const now = new Date(iso)
      for (const p of [BEACH, INLAND] as Place[]) {
        const got = fogRainFrom(input(p, now))
        const want = fogLine(fogSpot(p, now), now, TZ)
        expect(got.fog?.line ?? null, `${p.name} ${iso}`).toBe(want.line)
        expect(got.fog?.now.level ?? null, `${p.name} ${iso}`).toBe(want.now.level)
      }
    }
  })
  it('reads every airport METAR the station store keeps, none of them on the water', () => {
    const now = new Date('2026-11-23T21:30:00Z')
    const st = fogStationsOf(reportsAt(BEACH, now), now)
    expect(st.length).toBeGreaterThan(0)
    expect(st.every((s) => !s.onWater)).toBe(true)
    expect(new Set(st.map((s) => s.id))).toContain('KNTU')
  })
  it('without the forecast: no fog line, the rain from what else there is, never a made-up dry', () => {
    const now = new Date('2026-11-23T21:30:00Z')
    const got = fogRainFrom(input(BEACH, now, { wx: null, quarters: null, reports: [] }))
    expect(got.fog).toBeNull()
    expect(got.fogAt(now)).toBeNull()
    expect(got.fogHigh(now)).toBeNull()
    expect(got.rain).toBeNull()
    expect(got.rainLine).toBeNull()
  })
})

describe('the three field moments', () => {
  it('23 Nov 4:30 PM: "Fog on the beach" at the beach, no fog line inland; the Day sheet marks the 4 PM hour high at the beach only', () => {
    const now = new Date('2026-11-23T21:30:00Z')
    const beach = fogRainFrom(input(BEACH, now))
    const inland = fogRainFrom(input(INLAND, now))
    expect(beach.fog?.line).toBe('Fog on the beach')
    expect(inland.fog?.now.level).toBe('low')
    expect(beach.fogHigh(new Date('2026-11-23T21:00:00Z'))).toBe(true)
    expect(inland.fogHigh(new Date('2026-11-23T21:00:00Z'))).toBe(false)
  })
  it('21 Nov 7:30 AM: fog at the beach (KNTU MIFG)', () => {
    const now = new Date('2026-11-21T12:30:00Z')
    expect(fogRainFrom(input(BEACH, now)).fog?.now.level).toBe('high')
  })
  it('23 Nov 11:14 PM with the radar scan: "Showers nearby · moving S", eight quarter-hour bars', async () => {
    const now = new Date('2026-11-24T04:14:00Z')
    const radar = await radarAt(BEACH, new Date('2026-11-24T04:10:00Z'))
    expect(radar?.grid).toBeDefined()
    const got = fogRainFrom(input(BEACH, now, { radar }))
    expect(got.rain?.state).toBe('nearby')
    expect(got.rainLine).toBe('Showers nearby · moving S')
    expect(got.rain?.bars).toHaveLength(8)
  })
  it('the same moment without the radar: the stations and the forecast alone, not "nearby" from nowhere', () => {
    const now = new Date('2026-11-24T04:14:00Z')
    const got = fogRainFrom(input(BEACH, now))
    expect(got.rain?.state).not.toBe('raining')
    expect(got.rain?.state).not.toBe('unknown')
  })
})

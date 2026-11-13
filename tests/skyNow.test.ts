import { readFileSync } from 'node:fs'
import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { eventCall } from '../src/core/briefing.ts'
import { fireVerdict } from '../src/core/fireOutlook.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { opensOnNow, skyNow, stationDoubt, withDoubt } from '../src/core/skyNow.ts'
import { formatClock } from '../src/core/timezone.ts'
import { nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

/*
 * THE SKY PAGE'S NOW, AND THE STATION OVER THE MODELS (Batch NOW, Section 1.1-1.2).
 * 12 Nov 9:40 AM: KNTU's 13:56Z report, broken at 10,000 and 25,000 ft
 * (tests/data/metars-2026-11-12-13.txt); the sunset's runs out then
 * (tests/data/stages-2026-11-12-sunset/paths-at-1440Z.json, Open-Meteo
 * single-runs; measurements/2026-11-12-sunset-stages.md): "no clouds to catch the light".
 */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const clock = (d: Date) => formatClock(d, 'America/New_York', 12)
const KNTU = 'KNTU 121356Z 23007KT 10SM BKN100 BKN250 16/12 A2954 RMK AO2 SLP006 T01610117'

describe('Now (1.1)', () => {
  it('the page opens on Now from sunrise + 30 min to sunset - 90 min', () => {
    const t = getTimes(new Date('2026-11-12T17:00:00Z'), PIER.lat, PIER.lon)
    const at = (iso: string) => opensOnNow(new Date(iso), t.sunrise, t.sunset)
    expect(at('2026-11-12T14:40:00Z')).toBe(true)
    expect(at('2026-11-12T11:50:00Z')).toBe(false)
    expect(at('2026-11-12T20:40:00Z')).toBe(false)
  })
  it('the clouds in words with their heights, and why it is worth a look', () => {
    const r = skyNow(parseMetarSky(KNTU), { low: 0, mid: 10, high: 40 }, 30, 'SSE')
    expect(r.clouds).toBe('broken deck at 10k, broken deck at 25k')
    expect(r.worth.map((w) => w.kind)).toContain('texture')
    const cirrus = skyNow(parseMetarSky('KNTU 121356Z 23007KT 10SM CLR A2954'), { low: 0, mid: 0, high: 45 }, 30, 'SSE')
    expect(cirrus.clouds).toBe('nothing under 12,000 ft · thin cirrus above (forecast)')
    expect(cirrus.worth.map((w) => w.kind)).toEqual(['iridescence'])
    const clear = skyNow(parseMetarSky('KNTU 121356Z 23007KT 10SM CLR A2954'), { low: 0, mid: 0, high: 0 }, 30, 'SSE')
    expect(clear.worth).toEqual([])
    expect(clear.nothing).toMatch(/clear sky/)
    const veil = skyNow(null, { low: 0, mid: 5, high: 90 }, 35, 'S')
    expect(veil.worth.map((w) => w.kind)).toContain('halo')
  })
})

describe('the station over the models (1.2): 12 Nov 9:40 AM', () => {
  const event = getTimes(new Date('2026-11-12T12:00:00Z'), PIER.lat, PIER.lon).sunset as Date
  const kept = JSON.parse(readFileSync('tests/data/stages-2026-11-12-sunset/paths-at-1440Z.json', 'utf8'))
  const v = fireVerdict(pathsAt(parseFirePaths(kept.payload)!, nearestHour(event)), { event, kind: 'sunset', venue: PIER })
  const now = new Date('2026-11-12T14:40:00Z')
  const station = { sky: parseMetarSky(KNTU)!, at: new Date('2026-11-12T13:56:00Z') }
  it('the models said no clouds; the station had two broken decks: said, with the event\'s time', () => {
    expect(v?.why).toBe('none')
    const d = stationDoubt(v, station, event, now, clock)
    expect(d?.line).toBe('KNTU sees broken mid and high cloud now · models clear it by 4:56 PM')
  })
  it('the call is one step less sure: Skip becomes Maybe', () => {
    const read = eventCall(v, 'sunset', event, now)
    expect(read.call).toBe('Skip')
    expect(withDoubt(read, stationDoubt(v, station, event, now, clock))?.call).toBe('Maybe')
  })
  it('a stale report, or a station that agrees, says nothing', () => {
    expect(stationDoubt(v, station, event, new Date(station.at.getTime() + 80 * 60_000), clock)).toBeNull()
    expect(stationDoubt(v, { ...station, sky: parseMetarSky('KNTU 121356Z 23007KT 10SM CLR A2954')! }, event, now, clock)).toBeNull()
  })
  it('the Sky page shows it under the call, and Now is its first tab', () => {
    const page = readFileSync('src/components/SkyPage.tsx', 'utf8')
    expect(page).toMatch(/data-doubt>\{doubt\.line\}/)
    expect(page).toMatch(/\['now', \.\.\./)
  })
})

describe('Now never says clear from nothing', () => {
  it('no station and no layer said: "did not say", not clear', () => {
    const r = skyNow(null, { low: null, mid: null, high: null }, 30, 'S')
    expect(r.clouds).not.toMatch(/clear/i)
    expect(r.nothing).toMatch(/nothing to go on/)
  })
})

describe('Now says the one sky word', () => {
  it('the forecast under 20,000 ft in the home\'s and the Weather page\'s words: "Partly cloudy", never "some cloud"', () => {
    expect(skyNow(null, { low: 40, mid: 20, high: 10 }, 30, 'S').clouds).toBe('partly cloudy under 20,000 ft (forecast) · thin cirrus above')
  })
})

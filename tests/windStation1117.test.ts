import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { windSide } from '../src/core/coastFacing.ts'
import { compassPoint } from '../src/core/field.ts'
import { freshPool, isFresh, pickStation, PICK_HOLD_MS, reviveChoice, withRemembered, type PickReading, type StationChoice } from '../src/core/stationPick.ts'
import { nearWind, type NearReading } from '../src/lib/nearWind.ts'
import type { Hourly } from '../src/lib/tideSheetData.ts'
import { stationNowFrom, type StationNow } from '../src/lib/useStationObs.ts'
import { halfHour, leanHourly, windAt, windWords } from '../src/lib/windNow.ts'
import { hourlyAt } from '../src/lib/tideSheetData.ts'

/*
 * ONE STATION, STABLE (Batch FIX, Section 1). 17 Nov 7:06 at the 1st St
 * jetty, two loads a minute apart: "13 kt NE onshore" leaning to Cape Henry
 * (16 kt, 7 min old) and "7 kt NNE cross-onshore" leaning to KNTU (3 kt,
 * 1 h 10 min old). fixtures/truth/2026-11-17-vb-wind.json holds both feeds;
 * the forecast was not saved, so a flat stand-in (the fixture says so) shows
 * the lean. Each "load" here runs the app's own path from cold: nearWind
 * with the feeds served from the fixture, then the one pick.
 */
interface Truth {
  place: { lat: number; lon: number; facingDeg: number }
  feeds: { now: string; coops: Record<string, unknown>; metar: Record<string, string> }
  model: { mps: number; fromDeg: number; gustMps: number }
}
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-17-vb-wind.json', 'utf8')) as Truth
const SPOT = { lat: truth.place.lat, lon: truth.place.lon }
const FACING = truth.place.facingDeg
const NOW = new Date(truth.feeds.now)
const KT = 1.943844

const DAY = Array.from({ length: 24 }, (_, i) => Date.UTC(2026, 10, 17) + i * 3_600_000)
const WX: Hourly = { times: DAY, values: { wind_speed_10m: DAY.map(() => truth.model.mps), wind_direction_10m: DAY.map(() => truth.model.fromDeg), wind_gusts_10m: DAY.map(() => truth.model.gustMps) } }

/** The feeds as the hosts would answer; `coopsAnswers` false: CO-OPS gave nothing on this load. */
function feeds(coopsAnswers: boolean) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const u = String(input)
    if (u.includes('tidesandcurrents')) {
      const id = new URL(u).searchParams.get('station') ?? ''
      const body = coopsAnswers ? truth.feeds.coops[id] : undefined
      return new Response(JSON.stringify(body ?? { error: { message: 'No data was found.' } }))
    }
    const nws = /\/stations\/([A-Z0-9]+)\/observations\/latest/.exec(u)
    if (nws !== null) {
      const raw = truth.feeds.metar[nws[1]]
      return raw === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ properties: { rawMessage: raw } }))
    }
    if (u.endsWith('/api/metar')) {
      const id = (JSON.parse(String(init?.body ?? '{}')) as { station?: string }).station ?? ''
      const raw = truth.feeds.metar[id]
      return raw === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ metar: raw }))
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
}

const load = async (coopsAnswers: boolean, facing: number | null = FACING, now = NOW) => nearWind(SPOT, now, feeds(coopsAnswers), facing !== null)

/** The headline as the Wind page says it: "13 kt NE" and the side. */
function headline(obs: StationNow | null, facing: number | null = FACING, now = NOW) {
  const w = windAt(WX, now, obs, now)
  return { words: windWords(w, 'kt'), side: w?.fromDeg == null || facing === null ? null : windSide(w.fromDeg, facing), kt: w === null ? null : Math.round(w.mps * KT) }
}

describe('the diagnosis: what the old pick did with these two feeds', () => {
  it('both feeds answered: Cape Henry, whether the beach\'s facing came back or not', async () => {
    expect((await load(true)).best?.station.label).toBe('Cape Henry')
    expect((await load(true, null)).best?.station.label).toBe('Cape Henry')
  })
  it('Cape Henry\'s feed gave nothing: KNTU at 70 minutes, inside the old 75', async () => {
    const b = (await load(false)).best
    expect(b?.station.id).toBe('KNTU')
    expect(Math.round((NOW.getTime() - b!.at.getTime()) / 60_000)).toBe(70)
  })
})

describe('the fixture: the same answer on 5 reloads', () => {
  it('identical inputs, from cold each time and with the choice kept: Cape Henry and one headline', async () => {
    const seen = new Set<string>()
    let kept: StationChoice | null = null
    for (let i = 0; i < 5; i += 1) {
      const got = await load(true)
      const cold = stationNowFrom(got, FACING, NOW, null)
      const warm = stationNowFrom(got, FACING, NOW, kept)
      kept = warm.choice
      for (const r of [cold, warm]) {
        expect(r.value?.id).toBe('8638999')
        const h = headline(r.value)
        seen.add(`${r.value?.label} ${h.words} ${h.side}`)
      }
    }
    expect(seen.size).toBe(1)
  })
  it('the 7:07 load where Cape Henry did not answer: still Cape Henry, from its kept reading; the old pick flipped', async () => {
    let kept: StationChoice | null = null
    const before = new Set<string>()
    const after = new Set<string>()
    for (const answers of [true, false, true, false, true]) {
      const got = await load(answers)
      const r = stationNowFrom(got, FACING, NOW, kept)
      kept = r.choice
      after.add(`${r.value?.label} ${headline(r.value).words}`)
      /* The old path: nearWind's best, carried to 10 m the same way. */
      const old = stationNowFrom({ stations: got.stations, readings: got.readings.map((x) => (x === got.best ? x : null)) }, FACING, NOW, null)
      before.add(`${old.value?.label} ${headline(old.value).words}`)
    }
    expect([...after]).toHaveLength(1)
    expect([...after][0]).toMatch(/^Cape Henry /)
    expect(before.size).toBe(2)
  })
  it('a phone with no kept choice on that load: KNTU at 70 minutes is the only fresh reading near, and it is said with its age', async () => {
    const r = stationNowFrom(await load(false), FACING, NOW, null)
    expect(r.value?.id).toBe('KNTU')
  })
})

describe('the picker (src/core/stationPick.ts)', () => {
  const R = (id: string, kind: 'airport' | 'coastal', km: number, minAgo: number, kt = 10): PickReading => ({ station: { id, kind, km }, at: new Date(NOW.getTime() - minAgo * 60_000), kt, gustKt: null, fromDeg: 45 })
  it('never a 70-minute report when a 7-minute one is in range, at a beach or inland, airport or coast', () => {
    expect(pickStation([R('KNTU', 'airport', 6, 70), R('CAPE', 'coastal', 10, 7)], NOW, null, true)?.reading.station.id).toBe('CAPE')
    expect(pickStation([R('KNTU', 'airport', 6, 70), R('CAPE', 'coastal', 10, 7)], NOW, null, false)?.reading.station.id).toBe('CAPE')
    /* The half-hour rule beats the coast first. */
    expect(pickStation([R('KNTU', 'airport', 6, 7), R('CAPE', 'coastal', 10, 70)], NOW, null, true)?.reading.station.id).toBe('KNTU')
  })
  it('fresh is 75 minutes with one choice, 30 with two or more', () => {
    expect(freshPool([R('A', 'airport', 1, 74)], NOW).length).toBe(1)
    expect(freshPool([R('A', 'airport', 1, 76)], NOW).length).toBe(0)
    expect(freshPool([R('A', 'airport', 1, 40), R('B', 'airport', 2, 50)], NOW).map((r) => r.station.id)).toEqual(['A', 'B'])
    expect(freshPool([R('A', 'airport', 1, 29), R('B', 'airport', 2, 50)], NOW).map((r) => r.station.id)).toEqual(['A'])
    expect(isFresh(R('F', 'airport', 1, -11), NOW)).toBe(false)
  })
  it('at a beach the coast first, then the nearest', () => {
    expect(pickStation([R('KNTU', 'airport', 6, 5), R('FAR', 'coastal', 25, 20), R('NEAR', 'coastal', 10, 25)], NOW, null, true)?.reading.station.id).toBe('NEAR')
  })
  it('holds the last choice for 30 minutes while it stays fresh, then picks again', () => {
    const prev: StationChoice = { id: 'KNTU', chosenAt: NOW.getTime() - 10 * 60_000, reading: { at: NOW.getTime() - 20 * 60_000, kt: 3, gustKt: null, fromDeg: 20 } }
    const both = [R('KNTU', 'airport', 6, 20), R('CAPE', 'coastal', 10, 5)]
    expect(pickStation(both, NOW, prev, true)).toMatchObject({ why: 'held', reading: { station: { id: 'KNTU' } } })
    const later = new Date(prev.chosenAt + PICK_HOLD_MS + 60_000)
    expect(pickStation(both.map((r) => ({ ...r, at: new Date(r.at.getTime() + PICK_HOLD_MS) })), later, prev, true)?.reading.station.id).toBe('CAPE')
    /* Stale ends the hold at once. */
    expect(pickStation([R('KNTU', 'airport', 6, 80), R('CAPE', 'coastal', 10, 5)], NOW, prev, true)?.reading.station.id).toBe('CAPE')
  })
  it('a kept reading stands in for a station that did not answer, never past 75 minutes', () => {
    const make = (id: string, r: StationChoice['reading']): PickReading => ({ station: { id, kind: 'coastal', km: 10 }, at: new Date(r.at), kt: r.kt, gustKt: r.gustKt, fromDeg: r.fromDeg })
    const prev: StationChoice = { id: 'CAPE', chosenAt: NOW.getTime() - 60_000, reading: { at: NOW.getTime() - 8 * 60_000, kt: 16, gustKt: null, fromDeg: 45 } }
    const merged = withRemembered([R('KNTU', 'airport', 6, 70), null], prev, make)
    expect(pickStation(merged, NOW, prev, true)?.reading.station.id).toBe('CAPE')
    const old: StationChoice = { ...prev, reading: { ...prev.reading, at: NOW.getTime() - 80 * 60_000 } }
    expect(pickStation(withRemembered([R('KNTU', 'airport', 6, 70)], old, make), NOW, old, true)?.reading.station.id).toBe('KNTU')
    /* A newer answer from the station wins over what was kept. */
    const fresh = withRemembered([R('CAPE', 'coastal', 10, 2, 18)], prev, make)
    expect(fresh[0]?.kt).toBe(18)
  })
  it('reads back only a well-formed kept choice', () => {
    expect(reviveChoice(null)).toBeNull()
    expect(reviveChoice({ id: 'X', chosenAt: 1 })).toBeNull()
    expect(reviveChoice({ id: 'X', chosenAt: 1, reading: { at: 2, kt: -1 } })).toBeNull()
    expect(reviveChoice({ id: 'X', chosenAt: 1, reading: { at: 2, kt: 3, gustKt: 'x', fromDeg: 20 } })).toEqual({ id: 'X', chosenAt: 1, reading: { at: 2, kt: 3, gustKt: null, fromDeg: 20 } })
  })
})

describe('every screen reads the one pick', () => {
  it('the surf call\'s wind at the hour now is the headline\'s', async () => {
    const r = stationNowFrom(await load(true), FACING, NOW, null)
    const leaned = leanHourly(WX, r.value, NOW)!
    const head = windAt(WX, NOW, r.value, NOW)!
    const at = halfHour(NOW)
    expect(hourlyAt(leaned, 'wind_speed_10m', at)).toBeCloseTo(head.mps, 9)
    expect(hourlyAt(leaned, 'wind_direction_10m', at)).toBeCloseTo(head.fromDeg!, 9)
    /* Hours the report no longer weighs on are the model's. */
    expect(hourlyAt(leaned, 'wind_speed_10m', new Date(NOW.getTime() + 5 * 3_600_000))).toBe(truth.model.mps)
    expect(leanHourly(WX, null, NOW)).toBe(WX)
  })
  it('one store: the home, the Wind page, the map, the drone page and the surf call all read useStationObs, and only it asks nearWind', () => {
    for (const f of ['src/components/Home.tsx', 'src/components/WindPageV2.tsx', 'src/components/PlanMode.tsx', 'src/components/WindLayerV3.tsx', 'src/components/DronePage.tsx', 'src/lib/useSurfNow.ts']) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/useStationObs\((venue|spot)\)/)
    }
    for (const f of ['src/components/Home.tsx', 'src/components/WindPageV2.tsx', 'src/components/PlanMode.tsx', 'src/components/WindLayerV3.tsx', 'src/components/DronePage.tsx', 'src/lib/useSurfNow.ts', 'src/components/WeatherPage.tsx', 'src/components/Menu.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bnearWind\(/)
    }
  })
  it('the Wind page names the station under the headline, and the map\'s readout at the spot is the same station', () => {
    const page = readFileSync('src/components/WindPageV2.tsx', 'utf8')
    expect(page).toMatch(/className="dhead__line dwind__station" data-wind-station=\{nearNow\.id\}/)
    const map = readFileSync('src/components/WindLayerV3.tsx', 'utf8')
    expect(map).toMatch(/nearSpot\s*\?\s*picked === null/)
  })
})

describe('the fixture, said', () => {
  it('Cape Henry is said "Cape Henry 16 kt NE"; KNTU "KNTU 3 kt NNE"', async () => {
    const got = await load(true)
    const by = (id: string) => got.readings.find((r): r is NearReading => r !== null && r.station.id === id)!
    expect(`${by('8638999').station.label} ${by('8638999').kt} kt ${compassPoint(by('8638999').fromDeg!)}`).toBe('Cape Henry 16 kt NE')
    expect(`${by('KNTU').station.label} ${by('KNTU').kt} kt ${compassPoint(by('KNTU').fromDeg!)}`).toBe('KNTU 3 kt NNE')
  })
})


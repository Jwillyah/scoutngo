import { readFileSync } from 'node:fs'
import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { afterglowCanvas, afterglowWindow, AFTERGLOW_FROM, AFTERGLOW_TO, antiSolar, readAfterglow } from '../src/core/afterglow.ts'
import { rankSpots } from '../src/core/bestSky.ts'
import { eventCall } from '../src/core/briefing.ts'
import { afterglowWords, fireVerdict } from '../src/core/fireOutlook.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { formatClock } from '../src/core/timezone.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'
import { nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { eventOf, replay, VB } from './bestSkyReplay.ts'

/*
 * THE OPPOSITE SKY (Batch NOW, Section 0; fixtures/truth/2026-11-12-vb-sunset.json:
 * pink on the clouds over the ocean to the east at sunset while the app said
 * "Unlikely"). Measured: measurements/2026-11-12-afterglow-replay.md,
 * measurements/2026-11-12-sunset-stages.md, measurements/2026-11-13-sunrise-stages.md.
 */
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb-sunset.json', 'utf8')) as { place: { lat: number; lon: number; facingDeg: number } }
const PIER = { lat: truth.place.lat, lon: truth.place.lon }
const clock = (d: Date) => formatClock(d, 'America/New_York', 12)

describe('the afterglow, arithmetic', () => {
  it('broken cloud catches it; none, or a lid, does not', () => {
    expect(afterglowCanvas(AFTERGLOW_FROM - 1)).toBe(0)
    expect(afterglowCanvas(AFTERGLOW_FROM)).toBe(1)
    expect(afterglowCanvas(AFTERGLOW_TO)).toBe(1)
    expect(afterglowCanvas(100)).toBe(0)
    expect(antiSolar(248)).toBe(68)
    expect(antiSolar(112)).toBe(292)
  })
  it('lit only when the light gets in from the sun\'s side; the Belt of Venus over a clear opposite sky, Little alone', () => {
    const cloud = [{ low: 40, mid: 0 }]
    expect(readAfterglow({ opposite: cloud, sunLow: [10, 10] }).fires).toBe(true)
    expect(readAfterglow({ opposite: cloud, sunLow: [95, 95] }).fires).toBe(false)
    /* A station that reports nothing under 6,500 ft opens the low gap, as for Sky fire. */
    expect(readAfterglow({ opposite: cloud, sunLow: [95, 95], lowClear: true }).fires).toBe(true)
    const belt = readAfterglow({ opposite: [{ low: 2, mid: 0 }], sunLow: [5] })
    expect(belt.belt).toBe(true)
    expect(belt.score).toBeLessThan(0.25)
  })
  it('from the sunset to 15 minutes after it; mirrored for a sunrise', () => {
    const e = new Date('2026-11-12T21:56:00Z')
    expect(afterglowWindow('sunset', e)).toEqual({ from: e, to: new Date('2026-11-12T22:11:00Z') })
    expect(afterglowWindow('sunrise', e)).toEqual({ from: new Date('2026-11-12T21:41:00Z'), to: e })
  })
})

describe('12 Nov sunset, replayed', () => {
  it('Where\'s the color: VB Pier and the oceanfront Possible or better, facing the pink over the ocean', () => {
    const { az } = eventOf('2026-11-12', 'sunset')
    const ranked = rankSpots(replay('2026-11-12', 'sunset', null, 'sunset'), STARTER_SPOTS, az, VB)
    for (const id of ['vb-pier', 'rudee-inlet']) {
      const r = ranked.find((x) => x.spot.id === id)!
      expect(['Likely', 'Possible']).toContain(r.word)
      expect(r.why[0]).toMatch(/^pink on the clouds E/)
    }
  })
  it('11 Nov: Lynnhaven Inlet still first alone', () => {
    const { az } = eventOf('2026-11-11', 'sunset')
    const ranked = rankSpots(replay('2026-11-11', 'sunset', null), STARTER_SPOTS, az, VB)
    expect(ranked[0].spot.id).toBe('lynnhaven-inlet')
  })
  it('Sky fire on the latest runs: not Unlikely, and the words name it', () => {
    const fx = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-12-sunset.json', 'utf8'))
    const event = new Date(fx.event)
    const v = fireVerdict(pathsAt(parseFirePaths(fx.payload)!, fx.hour), { event, kind: 'sunset', venue: PIER, facing: truth.place.facingDeg })
    expect(v?.word).not.toBe('unlikely')
    expect(v?.afterglow?.counts).toBe(true)
    expect(afterglowWords(v, clock)).toBe('Pink on the clouds over the ocean, 4:56 PM–5:11 PM · look ENE')
  })
  it('as it was called, 30 min before: Maybe, all five models see the pink; without the opposite sky the words would not say it', () => {
    const event = getTimes(new Date('2026-11-12T12:00:00Z'), PIER.lat, PIER.lon).sunset as Date
    const kept = JSON.parse(readFileSync('tests/data/stages-2026-11-12-sunset/paths-T-30min.json', 'utf8'))
    const paths = pathsAt(parseFirePaths(kept.payload)!, nearestHour(event))
    const now = new Date(event.getTime() - 30 * 60_000)
    const metar = 'KNTU 122056Z 25007KT 10SM BKN055 BKN070 BKN250 21/09 A2942'
    const ctx = { event, kind: 'sunset' as const, venue: PIER, station: { sky: parseMetarSky(metar)!, at: new Date('2026-11-12T20:56:00Z') }, facing: truth.place.facingDeg }
    const v = fireVerdict(paths, ctx)
    expect(v?.word).not.toBe('unlikely')
    expect(eventCall(v, 'sunset', event, now).call).toBe('Maybe')
    expect(v?.afterglow?.agree).toBe(5)
    const bare = fireVerdict(paths.map((p) => ({ model: p.model, samples: p.samples })), ctx)
    expect(bare?.afterglow).toBeNull()
    expect(afterglowWords(bare, clock)).toBeNull()
  })
})

describe('the home says where to look', () => {
  it('"Color now" looks at the opposite sky when that is the color', async () => {
    const { colorNowLine } = await import('../src/core/colorNow.ts')
    const event = new Date('2026-11-12T21:56:37Z')
    const read = { kind: 'sunset' as const, event, call: 'Maybe' as const, why: '', confirmed: false, colorFrom: event, colorTo: event, setUp: null, agree: 2, of: 5, lookDeg: 68 }
    expect(colorNowLine([read], new Date(event.getTime() + 5 * 60_000), PIER, 'America/New_York')).toBe('Color now · sunset 4:56 PM · look E')
    expect(colorNowLine([{ ...read, lookDeg: null }], new Date(event.getTime() + 5 * 60_000), PIER, 'America/New_York')).toMatch(/look W$/)
  })
})

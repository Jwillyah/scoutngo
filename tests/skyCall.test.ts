import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventCall, type CallRead } from '../src/core/briefing.ts'
import { colorNowLine } from '../src/core/colorNow.ts'
import { fireVerdict } from '../src/core/fireOutlook.ts'
import { goAlertDue } from '../src/core/goAlert.ts'
import { satRead } from '../src/core/goesNowcast.ts'
import { deckTruth, stationDeck } from '../src/core/layerTruth.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { colourNowWords, skyCallNow, type SkyDayIn } from '../src/core/skyCall.ts'
import { stationDoubt } from '../src/core/skyNow.ts'
import { plainChecks } from '../src/core/skyPage.ts'
import { cloudRange, rangeWord } from '../src/core/skyWord.ts'
import { nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

/*
 * BATCH CORE, SECTION 1: THE SUNSET CALL. Field truth: fixtures/truth/
 * 2026-11-14-vb-sunset.json (good toward WSW, the app said Little) and
 * 2026-11-15-vb-sunset.json (FIRE; the app had moved on to tomorrow). The
 * replays are tests/data/sunset-<date>-vb-inland/ (scripts/capture-sunset-
 * 1114-1115.mjs), as scripts/measure-sunset-replay.mjs reads them.
 */
const TZ = 'America/New_York'
function replay(date: string, stageMin: number) {
  const dir = `tests/data/sunset-${date}-vb-inland`
  const kept = JSON.parse(readFileSync(`${dir}/paths.json`, 'utf8'))
  const event = new Date(kept.event)
  const now = new Date(event.getTime() - stageMin * 60_000)
  const paths = pathsAt(parseFirePaths(kept.payload)!, nearestHour(event))
  const metars = readFileSync(`${dir}/metars.txt`, 'utf8').trim().split('\n').map((l) => ({ at: new Date(l.slice(0, 25)), raw: l.slice(26) })).filter((m) => m.raw !== '')
  const m = metars.filter((x) => x.at <= now).at(-1)!
  const sky = parseMetarSky(m.raw)!
  const station = { sky, at: m.at }
  const stage = stageMin === 180 ? 'T-3h' : `T-${stageMin}`
  const g = JSON.parse(readFileSync(`${dir}/goes-${stage}.json`, 'utf8'))
  const sat = satRead(g.samples, new Date(g.frame), g.airC)
  const v = fireVerdict(paths, { event, kind: 'sunset', venue: kept.venue, station })
  const deck = stationDeck(sky)
  return { event, now, venue: kept.venue as { lat: number; lon: number }, read: eventCall(v, 'sunset', event, now, sat, { venue: kept.venue, truth: deck === null ? null : deckTruth({ station: deck }), gap: null, sky: station }) }
}

describe('1.2 observed cloud beats the models inside T-90', () => {
  it('15 Nov (FIRE): Likely at T-60 and at T-30, looking WSW', () => {
    for (const min of [60, 30]) {
      const { read } = replay('2026-11-15', min)
      expect(read.call, `T-${min}`).toBe('Go')
      expect(read.why).toMatch(/^Observed over the models: KNTU reports a broken deck at 6,[05]00 ft over you/)
      expect(read.lookDeg).toBeGreaterThan(236)
      expect(read.lookDeg).toBeLessThan(259)
    }
  })
  it('14 Nov (good toward WSW): Possible or better at T-60 and T-30, toward WSW, not the afterglow ENE', () => {
    for (const min of [60, 30]) {
      const { read } = replay('2026-11-14', min)
      expect(['Go', 'Maybe'], `T-${min}`).toContain(read.call)
      expect(read.lookDeg).toBeGreaterThan(236)
      expect(read.lookDeg).toBeLessThan(259)
    }
  })
  it('T-3 h is outside the window: the models\' call, as before', () => {
    expect(replay('2026-11-15', 180).read.why).not.toMatch(/^Observed/)
  })
})

describe('1.1 and 1.3 one sky call, held until the colour is over', () => {
  const { event, venue, read } = replay('2026-11-15', 30)
  const sunrise = new Date('2026-11-16T11:43:00Z')
  const days: SkyDayIn[] = [
    { events: { sunrise: new Date('2026-11-15T11:42:00Z'), sunset: event }, reads: { sunrise: null, sunset: read } },
    { events: { sunrise, sunset: new Date('2026-11-16T21:54:00Z') }, reads: { sunrise: { ...read, kind: 'sunrise', event: sunrise, call: 'Maybe' } as CallRead, sunset: null } },
  ]
  it('at 4:59 PM, four minutes after the sunset, the call is still tonight\'s sunset; tomorrow\'s sunrise only once the colour is over', () => {
    const at459 = new Date('2026-11-15T21:59:00Z')
    expect(skyCallNow(days, at459, venue)?.kind).toBe('sunset')
    expect(skyCallNow(days, at459, venue)?.word).toBe('color likely')
    expect(skyCallNow(days, new Date(event.getTime() + 21 * 60_000), venue)?.kind).toBe('sunrise')
  })
  it('every surface reads it: the home card, the Sky page\'s tabs and Next, the Go alert', () => {
    expect(readFileSync('src/components/Home.tsx', 'utf8')).toMatch(/skyCallNow\(brief\.days\.slice\(0, 2\), now, venue\)/)
    /* Batch SIMPLE-3, Section 0.2: through the one sky call object (src/lib/useSkyCalls.ts), whose `now` is skyCallNow's (tests/oneSkyCall.test.ts). */
    expect(readFileSync('src/components/SkyPage.tsx', 'utf8')).toMatch(/const one = useSkyCalls\(brief, venue, realNow, timeZone\)/)
    expect(readFileSync('src/components/SkyPage.tsx', 'utf8')).toMatch(/const soonest: Kind = one\.now\?\.kind/)
    expect(readFileSync('src/components/TileHome.tsx', 'utf8')).toMatch(/const calls = useSkyCalls\(brief, venue, now, timeZone\)/)
    expect(readFileSync('src/components/SkyPage.tsx', 'utf8')).not.toMatch(/nextEvent\(/)
  })
  it('the pill and the call agree on the event and the word at 4:59 PM', () => {
    const at459 = new Date('2026-11-15T21:59:00Z')
    const c = skyCallNow(days, at459, venue)!
    expect(colorNowLine([c.read], at459, venue, TZ)).toBe('Color now · sunset 4:55 PM · look WSW')
  })
  it('during the colour the Now headline is the event: "whole sky · look WSW then overhead" under the reported deck', () => {
    const c = skyCallNow(days, new Date('2026-11-15T21:59:00Z'), venue)!
    expect(colourNowWords(c, new Date('2026-11-15T21:59:00Z'), true)).toBe('whole sky · look WSW then overhead')
    expect(colourNowWords(c, new Date('2026-11-15T21:59:00Z'), false)).toBe('look WSW')
    expect(colourNowWords(c, new Date('2026-11-15T20:00:00Z'), true)).toBeNull()
  })
})

describe('1.4 the Go alert', () => {
  const { event, venue, read } = replay('2026-11-15', 30)
  const days: SkyDayIn[] = [{ events: { sunrise: null, sunset: event }, reads: { sunrise: null, sunset: { ...read, colorFrom: new Date('2026-11-15T21:44:00Z'), colorTo: new Date('2026-11-15T22:10:00Z') } } }]
  it('"Go now · color likely · 4:44 PM–5:10 PM · look WSW", once, inside T-45', () => {
    const c = skyCallNow(days, new Date('2026-11-15T21:25:00Z'), venue)!
    expect(goAlertDue(c, new Date('2026-11-15T21:25:00Z'), [], TZ)).toBe('Go now · color likely · 4:44 PM–5:10 PM · look WSW')
    expect(goAlertDue(c, new Date('2026-11-15T21:25:00Z'), [`sunset-${event.getTime()}`], TZ)).toBeNull()
    expect(goAlertDue(c, new Date('2026-11-15T20:55:00Z'), [], TZ)).toBeNull()
  })
  it('local only: no push service, no request leaves the phone for it', () => {
    const src = readFileSync('src/lib/goAlert.ts', 'utf8')
    expect(src).not.toMatch(/fetch\(|pushManager|PushManager|subscribe\(/)
  })
})

describe('1.5 fast cloud days say the range', () => {
  it('rows at 20 kt and more, swinging 30% or more: "Clouds coming and going · 30–70%"', () => {
    const r = cloudRange([30, 70, 40, 65, 35], 25 * 0.514444)
    expect(r).toEqual({ lo: 30, hi: 70 })
    expect(rangeWord(r!)).toBe('Clouds coming and going · 30–70%')
    expect(cloudRange([30, 70, 40, 65, 35], 15 * 0.514444)).toBeNull()
    expect(cloudRange([50, 60, 55, 50, 60], 30 * 0.514444)).toBeNull()
  })
})

describe('1.6 a moving deck', () => {
  const sky = parseMetarSky('KNTU 151956Z BKN065')!
  const v = { sky: { layers: [{ layer: 'mid', cover: 10 }] } } as unknown as Parameters<typeof stationDoubt>[0]
  const event = new Date('2026-11-15T21:55:00Z')
  const clock = (d: Date) => d.toISOString().slice(11, 16)
  it('a report 40 min old is not held against a deck moving at 20 kt or more', () => {
    expect(stationDoubt(v, { sky, at: new Date('2026-11-15T19:56:00Z') }, event, new Date('2026-11-15T20:36:00Z'), clock, { fromDeg: 315, mps: 25 * 0.514444 })).toBeNull()
  })
  it('a fresh one says where the deck is going and when the models clear it here', () => {
    const d = stationDoubt(v, { sky, at: new Date('2026-11-15T19:56:00Z') }, event, new Date('2026-11-15T20:10:00Z'), clock, { fromDeg: 315, mps: 25 * 0.514444 }, new Date('2026-11-15T20:30:00Z'))
    expect(d?.line).toBe('KNTU sees broken mid cloud now · deck moving SE · clearing here by ~20:30')
  })
})

describe('1.7 the why lines say the deck the station reports', () => {
  it('"Clouds to light up: KNTU broken at 6,000 ft", never "none" with "no clouds, so no gap needed" under it', () => {
    const v = plainChecks(null, 'WSW', 'KNTU broken at 6,000 ft', 'open').map((c) => c.value)
    expect(v).toEqual(['KNTU broken at 6,000 ft', 'open (satellite)', 'no'])
  })
})

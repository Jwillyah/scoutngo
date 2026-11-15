import { readFileSync } from 'node:fs'
import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import type { RankedSpot } from '../src/core/bestSky.ts'
import { gridSummary, STATION_DECK_PCT } from '../src/core/bestSkyWords.ts'
import type { CallRead } from '../src/core/briefing.ts'
import { colorNowLine, SUNSET_NOW_BEFORE_MS } from '../src/core/colorNow.ts'
import { metarTime, parseMetarSky } from '../src/core/metar.ts'
import { plainChecks, RARE_MAX, RARE_WAIT_MS } from '../src/core/skyPage.ts'
import { stationWord } from '../src/core/skyWord.ts'
import { stationSky } from '../src/lib/skyFireData.ts'

/*
 * 14 NOV, 4:39 PM, VIRGINIA BEACH INLAND (Batch LIVE, Section 10). The field
 * truth is fixtures/truth/2026-11-14-vb-sunset.json: broken cumulus at 5-6k,
 * gold WSW, pink tops ENE. No exact coordinate is kept; a rounded city point.
 */
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-14-vb-sunset.json', 'utf8')) as { observedAt: string; station: { metar: string }; shouldSay: { pillAt1639: string } }
const VB = { lat: 36.8, lon: -76.1 }
const TZ = 'America/New_York'
const now = new Date(truth.observedAt)
const sunset = getTimes(new Date('2026-11-14T17:00:00Z'), VB.lat, VB.lon).sunset as Date
const read = (call: CallRead['call']): CallRead => ({ kind: 'sunset', event: sunset, call, why: '', confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 3, of: 5 })

describe('the pill says "Color now" only when it is', () => {
  it('at 4:39 PM: "Color from 4:49 PM · look WSW + ENE", not "Color now"', () => {
    expect(colorNowLine([null, read('Maybe')], now, VB, TZ)).toBe(truth.shouldSay.pillAt1639)
  })
  it('from the colour window\'s start to 20 min after the sunset, "Color now"', () => {
    expect(colorNowLine([read('Go')], new Date(sunset.getTime() - SUNSET_NOW_BEFORE_MS), VB, TZ)).toMatch(/^Color now · sunset 4:5\d PM · look /)
    expect(colorNowLine([read('Go')], new Date(sunset.getTime() + 20 * 60_000), VB, TZ)).toMatch(/^Color now/)
    expect(colorNowLine([read('Go')], new Date(sunset.getTime() + 21 * 60_000), VB, TZ)).toBeNull()
  })
})

describe('Sky Now and Sky Tonight read the same station', () => {
  it('the METAR fallback\'s answer has no time; the report\'s own DDHHMMZ gives it', async () => {
    expect(metarTime(truth.station.metar, now)?.toISOString()).toBe('2026-11-14T21:35:00.000Z')
    expect(metarTime('KNTU 302355Z BKN055', new Date('2026-12-01T01:00:00Z'))?.toISOString()).toBe('2026-11-30T23:55:00.000Z')
    expect(metarTime('no time here', now)).toBeNull()
    const fake = (async (url: RequestInfo | URL) =>
      String(url).includes('weather.gov') ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ metar: truth.station.metar }), { status: 200 })) as typeof fetch
    const st = await stationSky('KNTU', fake)
    expect(st?.sky.groups).toEqual([{ amount: 'BKN', baseFt: 5500 }])
    /* SkyPage treats at === '' as no report: Sky Now said "no station report" under this deck. */
    expect(st?.at).not.toBe('')
  })
})

describe('Best Sky never says "no patch" under a broken deck', () => {
  const ranked = [{ spot: { name: 'Here' }, why: ['thin cloud'] }] as unknown as RankedSpot[]
  it('KNTU BKN overhead: the station\'s sky, not "no patch overhead anywhere in reach"', () => {
    const sky = parseMetarSky(truth.station.metar)!
    const line = `${sky.station} ${stationWord(sky)!.toLowerCase()}`
    const said = gridSummary(ranked, { cover: 75, line })
    expect(said).not.toMatch(/no patch overhead|clear/)
    expect(said).toBe('KNTU mostly cloudy overhead · the models show no patch')
    expect(gridSummary(ranked, { cover: STATION_DECK_PCT - 1, line })).toBe('no patch overhead anywhere in reach')
    expect(gridSummary(ranked)).toBe('no patch overhead anywhere in reach')
  })
})

describe('the three why lines come from one cloud state', () => {
  it('cloud blocking the sun closes the gap; it is never "no clouds, so no gap needed"', () => {
    const l = { layer: 'low', cover: 70, canvas: false, gap: null, hiddenBy: { layer: 'low', cover: 75 }, fires: false, why: 'none' } as unknown as Parameters<typeof plainChecks>[0]
    const v = plainChecks(l, 'WSW').map((c) => c.value)
    expect(v).toEqual(['none lit past the blocking cloud', 'closed', 'yes, low cloud 75%'])
    for (const [c, g, b] of [v]) expect(!(b.startsWith('yes') && (g.startsWith('no clouds') || c === 'none'))).toBe(true)
  })
})

describe('rare light', () => {
  it('three a week at most, and a 10 s wait before it says the forecast did not arrive', () => {
    expect(RARE_MAX).toBe(3)
    expect(RARE_WAIT_MS).toBe(10_000)
    expect(readFileSync('src/components/SkyPage.tsx', 'utf8')).toMatch(/setTimeout\([^]*rows: null[^]*RARE_WAIT_MS\)/)
  })
})

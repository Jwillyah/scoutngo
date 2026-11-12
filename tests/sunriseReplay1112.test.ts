import { readFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { FEED_OBS_MS } from '../api/calendar.ts'
import { CONFIRM_WITHIN_MS, eventCall, observedCanvas, type Call } from '../src/core/briefing.ts'
import { feedIcs } from '../src/core/calendarFeed.ts'
import { fireVerdict } from '../src/core/fireOutlook.ts'
import { satRead } from '../src/core/goesNowcast.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { feedIds, feedObsFrom } from '../src/lib/feedObs.ts'
import { nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { gapFrom, truthFrom } from '../src/lib/skyObsData.ts'

/*
 * THE 12 NOV SUNRISE, REPLAYED (Batch TRUTH, Section 0). It fired: pink and
 * orange altocumulus over the pier. The inputs as they stood at each stage,
 * kept by scripts/measure-sunrise-replay.mjs in tests/data/sunrise-2026-11-12/:
 * each model's run published by then (Open-Meteo's single-runs archive),
 * KNTU's METARs (IEM) and GOES-East band 13 along the sun's line (GIBS).
 * Before the fix the overnight runs had no mid cloud, the call fell to Skip
 * at T-3 h and the calendar lost its event.
 */
const DIR = 'tests/data/sunrise-2026-11-12'
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const FEED_AT = { lat: 36.84, lon: -75.97 }
const event = getTimes(new Date('2026-11-12T12:00:00Z'), PIER.lat, PIER.lon).sunrise as Date
const azimuth = getPosition(event, PIER.lat, PIER.lon).azimuth
const metars = readFileSync(`${DIR}/metars.txt`, 'utf8')
  .split('\n')
  .filter((l) => /^[A-Z]{3},/.test(l))
  .map((l) => {
    const [st, t, m] = l.split(',')
    return { station: `K${st}`, at: new Date(`${t.replace(' ', 'T')}:00Z`), sky: parseMetarSky(m) }
  })
const latestOf = (id: string, now: Date) => metars.filter((m) => m.station === id && m.at <= now && m.sky !== null).at(-1) ?? null
const RANK: Record<Call, number> = { Skip: 0, Maybe: 1, Go: 2 }
/* The field truth (fixtures/truth/2026-11-12-vb.json): it fired. */
const TRUTH = JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb.json', 'utf8')) as { sunrise: { outcome: string } }

function stage(name: string, leadMs: number) {
  const now = new Date(event.getTime() - leadMs)
  const kept = JSON.parse(readFileSync(`${DIR}/paths-${name}.json`, 'utf8')) as { payload: unknown }
  const data = parseFirePaths(kept.payload)
  const paths = data === null ? [] : pathsAt(data, nearestHour(event))
  /* As the phone (src/lib/useBriefing.ts): the nearest station in the two hours before, the satellite in the nowcast window. */
  const st = leadMs <= 2 * 3_600_000 ? latestOf('KNTU', now) : null
  const verdict = fireVerdict(paths, { event, kind: 'sunrise', venue: PIER, station: st === null ? null : { sky: st.sky!, at: st.at } })
  let sat = null
  try {
    const g = JSON.parse(readFileSync(`${DIR}/goes-${name}.json`, 'utf8')) as { frame: string; samples: { km: number; c: number | null }[] }
    /* The ground: KNTU's 13 °C when it is asked, else the warmest sample (as the script). */
    sat = satRead(g.samples, new Date(g.frame), st === null ? null : 13)
  } catch {
    sat = null
  }
  const truth = truthFrom({ station: st?.sky ?? null, pireps: [], sounding: null, profile: null, sat, modelLayer: null })
  const gap = gapFrom({ azimuthDeg: azimuth, line: [], reports: new Map(), station: st?.sky ?? null, sat, echoesKm: null })
  const call = eventCall(verdict, 'sunrise', event, now, sat, leadMs <= 3 * 3_600_000 ? { venue: PIER, truth, gap } : null)
  /* As the feed's server (api/calendar.ts): the models, and the stations by id in its window; no satellite. */
  const { own, ids } = feedIds(FEED_AT, event)
  const skies = new Map(ids.flatMap((id) => {
    const m = latestOf(id, now)
    return m === null || m.sky === null ? [] : [[id, m.sky] as const]
  }))
  const feedCall = eventCall(fireVerdict(paths, { event, kind: 'sunrise', venue: FEED_AT }), 'sunrise', event, now, null, leadMs <= FEED_OBS_MS ? feedObsFrom(FEED_AT, event, skies, own) : null)
  return { verdict, call, feedCall, ics: feedIcs([feedCall], FEED_AT, now) }
}

describe('12 Nov sunrise at the Virginia Beach pier: Maybe or better at every stage', () => {
  for (const [name, lead] of [['T-12h', 12 * 3_600_000], ['T-3h', 3 * 3_600_000], ['T-30min', 30 * 60_000]] as const) {
    it(`${name}: the app's call and the calendar's`, () => {
      expect(TRUTH.sunrise.outcome).toBe('fired')
      const { call, feedCall, ics } = stage(name, lead)
      expect(RANK[call.call ?? 'Skip']).toBeGreaterThanOrEqual(RANK.Maybe)
      expect(RANK[feedCall.call ?? 'Skip']).toBeGreaterThanOrEqual(RANK.Maybe)
      expect(ics).toContain('BEGIN:VEVENT')
    })
  }

  it('at T-3h the models alone say no clouds; the satellite\'s canvas over the pier lifts it to Maybe', () => {
    const { verdict, call } = stage('T-3h', 3 * 3_600_000)
    expect(verdict?.word).toBe('unlikely')
    expect(verdict?.why).toBe('none')
    expect(call.call).toBe('Maybe')
    expect(call.why).toMatch(/^The satellite sees high or mid cloud over you, which the models do not have/)
  })

  it('at T-3h the calendar keeps its event from KNTU\'s mid deck (BKN140), read in the feed\'s three hours', () => {
    expect(FEED_OBS_MS).toBe(3 * 3_600_000)
    expect(FEED_OBS_MS).toBeGreaterThan(CONFIRM_WITHIN_MS)
    const { feedCall } = stage('T-3h', 3 * 3_600_000)
    expect(feedCall.why).toMatch(/^KNTU reports a mid deck \(14,000 ft\) over you/)
  })

  it('at T-30 min the station\'s deck and the open gap make it a Go in the app', () => {
    expect(stage('T-30min', 30 * 60_000).call.call).toBe('Go')
  })
})

describe('an observed canvas only answers "no clouds", never a lid or a shut gap', () => {
  it('a low deck reported over you is no canvas the models missed', () => {
    const low = truthFrom({ station: parseMetarSky('KNTU 121056Z 19003KT 10SM BKN030 13/12 A2958'), pireps: [], sounding: null, profile: null, sat: null, modelLayer: null })
    expect(observedCanvas(low, null)).toBeNull()
    const mid = truthFrom({ station: parseMetarSky('KNTU 121056Z 19003KT 10SM SCT120 BKN150 13/12 A2958'), pireps: [], sounding: null, profile: null, sat: null, modelLayer: null })
    expect(observedCanvas(mid, null)?.by).toBe('KNTU')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bestOfWeek, certainty, colorTag, dayCall, droneTag, eventCall, lightSteps, surfLine, surfTag, tideDay, windLevel, windTag } from '../src/core/briefing.ts'
import { fireVerdict, type FireContext } from '../src/core/fireOutlook.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { formatClock } from '../src/core/timezone.ts'
import { parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

/*
 * THE TODAY BRIEFING (Batch H, Section 2), and its accuracy bar (item 4):
 * every logged morning replayed. The four sunrises kept from Batch G, with
 * what the sky did at the pier: 29 Oct fired, 2 Nov fired, 30 Oct nothing
 * (clear), 11 Oct nothing (overcast, rain).
 */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const TZ = 'America/New_York'
const METARS = readFileSync('tests/data/korf-sunrise-metars.txt', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('ORF,'))
  .map((l) => {
    const [, t, m] = l.split(',')
    return { at: new Date(`${t.replace(' ', 'T')}:00Z`), sky: parseMetarSky(m) }
  })

function verdictOn(date: string, withStation: boolean) {
  const fx = JSON.parse(readFileSync(`tests/data/sky-fire-${date}-sunrise.json`, 'utf8')) as { payload: unknown; hour: string; event: string }
  const data = parseFirePaths(fx.payload)
  const paths = data === null ? [] : pathsAt(data, fx.hour)
  const event = new Date(fx.event)
  const near = METARS.filter((m) => m.sky !== null).sort((a, b) => Math.abs(a.at.getTime() - event.getTime()) - Math.abs(b.at.getTime() - event.getTime()))[0]
  const ctx: FireContext = { event, kind: 'sunrise', venue: PIER, aod: 0.1, station: withStation && near.sky !== null ? { sky: near.sky, at: near.at } : null }
  return { event, verdict: fireVerdict(paths, ctx) }
}

const LOG: Record<string, 'fired' | 'nothing'> = { '2026-10-29': 'fired', '2026-11-02': 'fired', '2026-10-30': 'nothing', '2026-10-11': 'nothing' }

describe('the accuracy bar: every logged morning, replayed', () => {
  for (const [date, outcome] of Object.entries(LOG)) {
    it(`${date} (${outcome}): 40 minutes out with the station, a hit`, () => {
      const { event, verdict } = verdictOn(date, true)
      const read = eventCall(verdict, 'sunrise', event, new Date(event.getTime() - 40 * 60_000))
      if (outcome === 'fired') expect(read.call).toBe('Go')
      else expect(read.call).toBe('Skip')
    })
    it(`${date}: a day out, no Go without the nowcast`, () => {
      const { event, verdict } = verdictOn(date, false)
      const read = eventCall(verdict, 'sunrise', event, new Date(event.getTime() - 20 * 3_600_000))
      expect(read.call).not.toBe('Go')
      expect(read.confirmed).toBe(false)
      if (outcome === 'nothing') expect(read.call).toBe('Skip')
    })
  }

  it('the overcast morning says why, in words', () => {
    const { event, verdict } = verdictOn('2026-10-11', true)
    expect(eventCall(verdict, 'sunrise', event, event).why).toBe('A lid of cloud.')
  })

  it('no verdict is no call, never a guess', () => {
    const read = eventCall(null, 'sunset', new Date(), new Date())
    expect(read.call).toBeNull()
    expect(read.why).toBe('The forecast did not say.')
  })
})

describe('the parts', () => {
  it('2 Nov: be set up before the colour, and the six steps in order of time', () => {
    const { event, verdict } = verdictOn('2026-11-02', true)
    const read = eventCall(verdict, 'sunrise', event, new Date(event.getTime() - 40 * 60_000))
    expect(formatClock(read.colorFrom as Date, TZ, 12)).toBe('6:01 AM')
    expect(formatClock(read.setUp as Date, TZ, 12)).toBe('5:51 AM')
    const steps = lightSteps('sunrise', event, PIER.lat, PIER.lon, verdict)
    expect(steps.map((s) => s.name)).toEqual(['Dark', 'Glow', 'Peak', 'Color', 'Golden', 'Clear'])
    const times = steps.map((s) => s.at?.getTime()).filter((t): t is number => t !== undefined)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(colorTag(verdict)).not.toBe('Flat')
  })

  it('the day takes its better event; the week its best', () => {
    const { event, verdict } = verdictOn('2026-11-02', true)
    const go = eventCall(verdict, 'sunrise', event, new Date(event.getTime() - 40 * 60_000))
    const skip = eventCall(verdictOn('2026-10-11', true).verdict, 'sunset', new Date(event.getTime() + 11 * 3_600_000), event)
    expect(dayCall([skip, go])?.call).toBe('Go')
    expect(bestOfWeek([skip, go])?.event).toEqual(event)
    expect(bestOfWeek([skip])).toBeNull()
  })

  it('3-step scales, less to more', () => {
    expect(surfTag(0.6, 'Clean')).toBe('Flat')
    expect(surfTag(2.5, 'Bumpy')).toBe('Fun')
    expect(surfTag(4.2, 'Clean')).toBe('Firing')
    expect(surfTag(4.2, 'Bumpy')).toBe('Fun')
    expect(windTag(270, 90)).toBe('Offshore')
    expect(windTag(0, 90)).toBe('Cross')
    expect(windTag(80, 90)).toBe('Onshore')
    expect(droneTag(3, 12)).toBe('Light wind')
    expect(droneTag(8, 12)).toBe('Breezy')
    expect(droneTag(11, 12)).toBe('Too windy')
    expect(droneTag(null, 12)).toBeNull()
    expect(windLevel(11.9)).toBe('calm')
    expect(windLevel(12)).toBe('amber')
    expect(windLevel(18)).toBe('orange')
  })

  it('surf in words from the bars', () => {
    const at = new Date('2026-11-02T15:00:00Z')
    expect(surfLine([{ at, faceFt: 2.2, clean: true, shape: 'Clean' }, { at, faceFt: 3.1, clean: false, shape: 'Bumpy' }], 9.2)).toBe('2–3 ft, knee to waist, 9 s')
    /* Batch Pages, Section 1: "1–4 ft" is "ankle to chest", from both ends, never "waist to chest" from the biggest alone. */
    expect(surfLine([{ at, faceFt: 1.2, clean: true, shape: 'Clean' }, { at, faceFt: 3.8, clean: true, shape: 'Clean' }], null)).toBe('1–4 ft, ankle to chest')
    expect(surfLine([], null)).toBeNull()
  })

  it('the tide: the next low, the level, rising or falling', () => {
    const ext = [
      { at: new Date('2026-11-02T09:05:00Z'), feet: 0.2, kind: 'low' as const },
      { at: new Date('2026-11-02T15:20:00Z'), feet: 3.4, kind: 'high' as const },
      { at: new Date('2026-11-02T21:40:00Z'), feet: 0.4, kind: 'low' as const },
    ]
    const d = tideDay(ext, new Date('2026-11-02T05:00:00Z'), new Date('2026-11-03T05:00:00Z'), new Date('2026-11-02T12:00:00Z'))
    expect(d.rising).toBe(true)
    expect(d.next?.kind).toBe('low')
    expect(d.level).toBe('Mid')
    expect(d.curve.length).toBeGreaterThan(10)
  })

  it('certainty: split models and far days get fewer dots', () => {
    const r = { kind: 'sunset' as const, event: new Date(), call: 'Maybe' as const, why: '', confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 5, of: 5 }
    expect(certainty(r, 0)).toBe(3)
    expect(certainty(r, 2)).toBe(2)
    expect(certainty(r, 5)).toBe(1)
    expect(certainty({ ...r, agree: 3 }, 0)).toBe(1)
  })
})

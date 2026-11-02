import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventCall } from '../src/core/briefing.ts'
import { fireVerdict, type FireContext } from '../src/core/fireOutlook.ts'
import { advectKm, inNowcast, satRead, type SatSample } from '../src/core/goesNowcast.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

/*
 * THE SATELLITE NOWCAST ON THE KEPT MORNINGS (Batch H, Section 2.2):
 * GOES-East band 13 an hour before each sunrise, sampled along the sun's
 * line (tests/data/goes-<date>.json, from scripts/measure-goes-nowcast.mjs;
 * measurements/2026-11-02-goes-nowcast.md), with the model verdict and
 * KORF's report as in tests/briefing.test.ts.
 */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const METARS = readFileSync('tests/data/korf-sunrise-metars.txt', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('ORF,'))
  .map((l) => {
    const [, t, m] = l.split(',')
    return { at: new Date(`${t.replace(' ', 'T')}:00Z`), sky: parseMetarSky(m) }
  })
const sat = (date: string) => {
  const g = JSON.parse(readFileSync(`tests/data/goes-${date}.json`, 'utf8')) as { frame: string; airC: number; samples: SatSample[] }
  return satRead(g.samples, new Date(g.frame), g.airC)
}
function morning(date: string) {
  const fx = JSON.parse(readFileSync(`tests/data/sky-fire-${date}-sunrise.json`, 'utf8')) as { payload: unknown; hour: string; event: string }
  const data = parseFirePaths(fx.payload)
  const paths = data === null ? [] : pathsAt(data, fx.hour)
  const event = new Date(fx.event)
  const near = METARS.filter((m) => m.sky !== null).sort((a, b) => Math.abs(a.at.getTime() - event.getTime()) - Math.abs(b.at.getTime() - event.getTime()))[0]
  const ctx: FireContext = { event, kind: 'sunrise', venue: PIER, aod: 0.1, station: near.sky === null ? null : { sky: near.sky, at: near.at } }
  return { event, verdict: fireVerdict(paths, ctx), ctx }
}

describe('what the satellite saw', () => {
  it('2 Nov: high cloud over you, not deep: a canvas, not blocked', () => {
    const r = sat('2026-11-02')
    expect(r?.canvas).toBe(true)
    expect(r?.blocked).toBe(false)
  })
  it('11 Oct: deep cloud all the way to the sun', () => {
    expect(sat('2026-10-11')?.blocked).toBe(true)
  })
  it('30 Oct (clear) and 29 Oct (a low deck infrared does not see): no canvas', () => {
    expect(sat('2026-10-30')?.canvas).toBe(false)
    expect(sat('2026-10-29')?.canvas).toBe(false)
  })
})

describe('the nowcast in the call, 40 minutes out', () => {
  const at = (e: Date) => new Date(e.getTime() - 40 * 60_000)
  it('the four mornings: 29 Oct and 2 Nov Go, 30 Oct and 11 Oct Skip', () => {
    for (const [date, want] of [['2026-10-29', 'Go'], ['2026-11-02', 'Go'], ['2026-10-30', 'Skip'], ['2026-10-11', 'Skip']] as const) {
      const { event, verdict } = morning(date)
      expect(eventCall(verdict, 'sunrise', event, at(event), sat(date)).call, date).toBe(want)
    }
  })

  it('2 Nov as the phone saw it, the models saying "a lid": the nowcast makes it a Go', () => {
    const { event, ctx } = morning('2026-11-02')
    const lid = { word: 'unlikely' as const, line: 'Fire unlikely: a lid of cloud', agree: 0, of: 5, perLayer: [], models: [], sky: { layers: [] }, why: 'lid' as const, station: { station: 'KORF', at: ctx.station?.at ?? event, lowOverhead: 0, lowBaseM: null, lowClear: true } }
    const read = eventCall(lid as unknown as Parameters<typeof eventCall>[0], 'sunrise', event, at(event), sat('2026-11-02'))
    expect(read.call).toBe('Go')
    expect(read.why).toMatch(/^Nowcast over the models: the satellite sees high or mid cloud over you/)
  })

  it('a day out the satellite is not asked, and the window is 3 h to 30 min', () => {
    const e = new Date('2026-11-02T11:28:00Z')
    expect(inNowcast(e, new Date(e.getTime() - 4 * 3_600_000))).toBe(false)
    expect(inNowcast(e, new Date(e.getTime() - 2 * 3_600_000))).toBe(true)
    expect(inNowcast(e, new Date(e.getTime() - 20 * 60_000))).toBe(false)
  })

  it('advects upwind: a westerly at 20 m/s for an hour reads 72 km to the west', () => {
    const d = advectKm(20, 270, 3_600_000)
    expect(Math.round(d.eastKm)).toBe(-72)
    expect(Math.abs(d.northKm)).toBeLessThan(0.01)
  })
})

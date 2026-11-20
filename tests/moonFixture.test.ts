import { readFileSync } from 'node:fs'
import { getMoonPosition, getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { moonPhasesBetween, phaseJde } from '../src/core/moonPhases.ts'
import { moonTimesOnLocalDay } from '../src/core/moonTimes.ts'
import { normalizeBearing } from '../src/core/sun.ts'
import { zonedTimeToUtc } from '../src/core/timezone.ts'

/*
 * THE MOON AT CHIC'S BEACH, HELD TO USNO.
 *
 * USNO's answers for 19–26 Nov and 7–9 Dec 2026 were fetched once and saved
 * in tests/data/usno-moon-2026-11-19/ (rstt/oneday in EST, moon/phases, and
 * celnav at each USNO rise and set minute for the bearing). The functions
 * asserted are the app's own: moonTimesOnLocalDay, suncalc's bearing and
 * sunrise/sunset as the app calls them, and moonPhases.ts. A time more than
 * 5 minutes or a bearing more than 2° from USNO fails.
 *
 * The number of comparisons is asserted, so a fixture that failed to load or
 * a day with no events cannot pass by comparing nothing
 * (docs/failure-modes.md, B). The comparison table:
 * measurements/2026-11-19-moon-fixture.md.
 */
const LAT = 36.92
const LON = -76.1
const TZ = 'America/New_York'
const DIR = 'tests/data/usno-moon-2026-11-19'
const LIMIT_MIN = 5
const LIMIT_DEG = 2

interface Phen { phen: string; time: string }
interface Day { answer: { properties: { data: { moondata: Phen[]; sundata: Phen[] } } } }
interface Nav { object: { almanac_data: { zn: number } } }
interface UsnoPhase { phase: string; year: number; month: number; day: number; time: string }

const oneday = JSON.parse(readFileSync(`${DIR}/rstt-oneday.json`, 'utf8')) as Record<string, Day>
const celnav = JSON.parse(readFileSync(`${DIR}/celnav-at-events.json`, 'utf8')) as Record<string, Nav>
const phases = (JSON.parse(readFileSync(`${DIR}/moon-phases.json`, 'utf8')) as { answer: { phasedata: UsnoPhase[] } }).answer.phasedata

/* USNO's EST minute, as an instant. */
function est(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, h + 5, mi))
}
const gapMin = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000
const noon = (date: string) => zonedTimeToUtc(date, '12:00', TZ)!

describe("the app's moon against USNO at Chic's Beach", () => {
  it('every moonrise and moonset within 5 min, and its bearing within 2°', () => {
    let times = 0
    let bearings = 0
    for (const [date, day] of Object.entries(oneday)) {
      const ours = moonTimesOnLocalDay(noon(date), LAT, LON, TZ)
      for (const e of day.answer.properties.data.moondata.filter((x) => x.phen === 'Rise' || x.phen === 'Set')) {
        const at = e.phen === 'Rise' ? ours.rise : ours.set
        expect(at, `${date} moon ${e.phen}`).not.toBeNull()
        expect(gapMin(at!, est(date, e.time)), `${date} moon ${e.phen}`).toBeLessThanOrEqual(LIMIT_MIN)
        times += 1
        const nav = celnav[`${date} Moon ${e.phen} ${e.time}`]
        if (nav === undefined) continue
        const az = normalizeBearing(getMoonPosition(at!, LAT, LON).azimuth)
        expect(Math.abs(az - nav.object.almanac_data.zn), `${date} moon ${e.phen} bearing`).toBeLessThanOrEqual(LIMIT_DEG)
        bearings += 1
      }
    }
    expect(times).toBe(22)
    expect(bearings).toBe(16)
  })

  it('sunrise and sunset, as the moments use them, within 5 min', () => {
    let n = 0
    for (const [date, day] of Object.entries(oneday)) {
      const sun = getTimes(noon(date), LAT, LON)
      for (const e of day.answer.properties.data.sundata.filter((x) => x.phen === 'Rise' || x.phen === 'Set')) {
        const ours = e.phen === 'Rise' ? sun.sunrise : sun.sunset
        expect(ours, `${date} sun ${e.phen}`).not.toBeNull()
        expect(gapMin(ours!, est(date, e.time)), `${date} sun ${e.phen}`).toBeLessThanOrEqual(LIMIT_MIN)
        n += 1
      }
    }
    expect(n).toBe(22)
  })

  it('every full and new moon in the saved list within 5 min', () => {
    const ours = moonPhasesBetween(new Date('2026-11-19T00:00:00Z'), new Date('2027-01-20T00:00:00Z'))
    const wanted = phases.filter((p) => p.phase === 'Full Moon' || p.phase === 'New Moon')
    expect(wanted.length).toBe(4)
    for (const p of wanted) {
      const [h, m] = p.time.split(':').map(Number)
      const at = new Date(Date.UTC(p.year, p.month - 1, p.day, h, m))
      const kind = p.phase === 'Full Moon' ? 'full' : 'new'
      const match = ours.filter((o) => o.kind === kind).map((o) => gapMin(o.at, at))
      expect(Math.min(...match), `${p.phase} ${at.toISOString()}`).toBeLessThanOrEqual(LIMIT_MIN)
    }
    expect(ours.map((o) => o.kind)).toEqual(['full', 'new', 'full', 'new'])
  })

  it("matches Meeus's own worked example (49.a, new moon of Feb 1977)", () => {
    expect(phaseJde(-283)).toBeCloseTo(2443192.65118, 4)
  })
})

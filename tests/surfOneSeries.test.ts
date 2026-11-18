import { describe, expect, it } from 'vitest'
import { surfDayHours, surfHourOf, surfNowFrom, surfObs } from '../src/lib/useSurfNow.ts'
import { buoyLean, dayHours } from '../src/lib/surfPageData.ts'
import { surfBand } from '../src/core/surfCall.ts'
import { surfCallLine } from '../src/core/markerReadout.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { venueToday } from '../src/core/eventDay.ts'
import { capeHenryAt, recordedDay, seaAt, TZ, VB } from './surfReplay.ts'

/*
 * ONE SURF SERIES (Batch FIX, Section 3.3). 17 Nov 7:05 AM: the home card
 * said 1-2 while its chart line read about 0.3 (the line was the briefing's
 * raw forecast face, the call the leaned centre), and the map said "swell
 * 1.0 ft 3 s NE" (the forecast's part it calls a swell, at the hour under
 * the thumb) while the Surf page said 44099's 0.3 ft 11 s and 3.0 ft 4 s.
 * Now the home's text and line, the Surf page's head and chart, the map's
 * readout at the spot and the week all read src/lib/useSurfNow.ts
 * surfNowFrom for the same hour. The 17 Nov recording, with Cape Henry.
 */
const stats = spotStats([], 0)
const d = recordedDay('tests/data/surf-2026-11-17')
const now = new Date('2026-11-17T12:05:00Z')
const sea = seaAt(d, VB, now)
const station = capeHenryAt(now, VB.facing)?.obs ?? null
const read = surfNowFrom(sea, stats, now, TZ, station)
const half = new Date('2026-11-17T12:30:00Z')

describe('home, Surf page, map readout and week: one call for the hour', () => {
  it('the hour now is in hand, with a call', () => {
    expect(station).not.toBe(null)
    expect(read.now?.at.getTime()).toBe(half.getTime())
    expect(read.week[0].call).not.toBe(null)
  })

  const words = read.week[0].call?.words ?? 'none'

  it('the week (today) and the home card text: the same call', () => {
    expect(read.week[0].hour).toBe(read.now)
    expect(words).toMatch(/^[0-9]–[0-9] ft$/)
  })

  it("the home card's chart line at now is the call's own centre, inside its band", () => {
    const pts = surfDayHours(read.series, TZ)
    const at = pts.find((h) => h.at.getTime() === half.getTime())
    expect(at).toBeDefined()
    expect(at?.centerFt).toBe(read.now?.centerFt)
    const [lo, hi] = surfBand(at?.centerFt ?? -1)
    expect(`${lo}–${hi} ft`).toBe(words)
  })

  /* The Surf page's head rendered with a station: src/components/surfPageV2.test.tsx, "one surf series (Batch FIX, Section 3.3)". */

  it("the Surf page's chart hours read the same centre as the series, hour for hour", () => {
    const lean = buoyLean(d.marine, d.wind, sea.buoy, sea.facing, stats, sea.factor ?? 1, now.getTime(), sea.buoys ?? [], sea.shelter ?? null)
    const hours = dayHours(d.marine, d.wind, venueToday(now, TZ), TZ, sea.facing, stats, sea.factor, lean, sea.shelter ?? null, surfObs(sea, now, station))
    const shared = hours.filter((h) => read.series.some((s) => s.at.getTime() === h.at.getTime()))
    expect(shared.length).toBeGreaterThan(5)
    for (const h of shared) {
      const s = read.series.find((x) => x.at.getTime() === h.at.getTime())
      expect([h.centerFt, h.clean, h.chop]).toEqual([s?.centerFt, s?.clean, s?.chop])
    }
  })

  it('the map readout at the spot says the call for the hour under the thumb, now and three hours on', () => {
    const atNow = surfHourOf(read.series, now, 0)
    expect(atNow?.call.words).toBe(words)
    expect(surfCallLine(atNow?.call ?? { words: '', size: '', quality: null })).toBe(`surf ${words} · ${read.week[0].call?.quality ?? read.week[0].call?.size}`)
    const later = new Date(now.getTime() + 3 * 3_600_000)
    const h3 = surfHourOf(read.series, later, 0)
    const chart = surfDayHours(read.series, TZ).find((h) => h.at.getTime() === h3?.hour.at.getTime())
    expect(h3).not.toBe(null)
    expect(h3?.hour.centerFt).toBe(chart?.centerFt)
  })
})

import { describe, expect, it } from 'vitest'
import { blowsToward, cloudWords, coldMinutes, coldTrim, COLD_TRIM_MAX, dayBars, estimatedBaseFt, gustAloft, kpRow, kpTime, limitChip, limitLine, limitRole, skyRow, visibilityWords } from './droneNow.ts'

const KT = 0.514444
const kt = (mps: number) => `${Math.round(mps / KT)} kt`
const at = (iso: string) => new Date(iso)

describe('the wind at 400 ft (board Drone_P1)', () => {
  it('carries the 10 m gust’s excess up: 15 kt at 400 ft, 10 m 9 gusting 16, is gusts 22', () => {
    expect(Math.round(gustAloft(9 * KT, 16 * KT, 15 * KT)! / KT)).toBe(22)
    expect(gustAloft(null, 16 * KT, 15 * KT)).toBeNull()
    /* A gust under the steady wind adds nothing. */
    expect(gustAloft(10, 8, 12)).toBe(12)
  })

  it('points the arrow where the wind blows: from NNW it points SSE', () => {
    expect(blowsToward(337.5)).toBe(157.5)
    expect(blowsToward(0)).toBe(180)
    expect(blowsToward(270)).toBe(90)
  })

  it('says the limit line with the gusts’ share: "Under your 23 kt limit · gusts at 96%"', () => {
    expect(limitLine(15 * KT, 22 * KT, 23 * KT, kt)).toBe('Under your 23 kt limit · gusts at 96%')
    expect(limitLine(25 * KT, null, 23 * KT, kt)).toBe('Over your 23 kt limit')
    expect(limitLine(15 * KT, 22 * KT, null, kt)).toBeNull()
  })

  it('colours by the home’s "Light wind" line, then to the limit, then at it', () => {
    expect(limitRole(5, 12)).toBe('calm')
    expect(limitRole(6, 12)).toBe('near')
    expect(limitRole(12, 12)).toBe('over')
    expect(limitRole(null, 12)).toBe('unknown')
  })
})

describe('the one chip (Batch FIX, Section 6.2; board Drone_Slim_1)', () => {
  const clock = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  const sunset = at('2026-11-17T21:53:00Z')
  const hours = (mps: (h: number) => number | null) => Array.from({ length: 24 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 17, i)), mps: mps(i) }))
  const now = at('2026-11-17T12:13:00Z')
  it('teal, under the limit until sunset, with the gusts’ share: "Under your limit until sunset 21:53 · gusts 46%"', () => {
    const c = limitChip(now, hours(() => 7 * KT), 7 * KT, 10.58 * KT, 23 * KT, sunset, clock, kt)
    expect(c).toEqual({ text: 'Under your limit until sunset 21:53 · gusts 46%', tone: 'ok' })
  })
  it('teal, until the first hour at the limit before sunset', () => {
    const c = limitChip(now, hours((h) => (h >= 18 ? 25 * KT : 9 * KT)), 9 * KT, 12 * KT, 23 * KT, sunset, clock, kt)
    expect(c).toEqual({ text: 'Under your limit until 18:00 · gusts 52%', tone: 'ok' })
  })
  it('says no "until" when an hour ahead is not forecast: it does not know how long', () => {
    expect(limitChip(now, hours((h) => (h === 15 ? null : 9 * KT)), 9 * KT, null, 23 * KT, sunset, clock, kt)).toEqual({ text: 'Under your limit', tone: 'ok' })
  })
  it('orange ONLY for limit or gust trouble', () => {
    expect(limitChip(now, hours(() => 25 * KT), 25 * KT, 30 * KT, 23 * KT, sunset, clock, kt)).toEqual({ text: 'Over your 23 kt limit · gusts 130%', tone: 'trouble' })
    expect(limitChip(now, hours(() => 18 * KT), 18 * KT, 24 * KT, 23 * KT, sunset, clock, kt)).toEqual({ text: 'Gusts 104% of your 23 kt limit', tone: 'trouble' })
    /* 96% gusts are under the limit: teal. */
    expect(limitChip(now, hours(() => 15 * KT), 15 * KT, 22 * KT, 23 * KT, sunset, clock, kt)?.tone).toBe('ok')
  })
  it('no chip with no limit or no wind at 400 ft (the page says which)', () => {
    expect(limitChip(now, [], 7 * KT, 10 * KT, null, sunset, clock, kt)).toBeNull()
    expect(limitChip(now, [], null, null, 23 * KT, sunset, clock, kt)).toBeNull()
  })
  it('never repeats the old orange "Calm now"', () => {
    const c = limitChip(now, hours(() => 3 * KT), 3 * KT, 4 * KT, 23 * KT, sunset, clock, kt)
    expect(c?.text).not.toMatch(/calm now/i)
    expect(c?.tone).toBe('ok')
  })
})

describe('today’s bars: daylight and civil twilight only', () => {
  const hours = Array.from({ length: 24 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 16, i)), mps: i }))
  const dawn = at('2026-11-16T11:10:00Z')
  const sunset = at('2026-11-16T21:53:00Z')
  const dusk = at('2026-11-16T22:20:00Z')
  it('runs from now to the hour holding civil dusk, with sunset and dusk inside', () => {
    const b = dayBars(hours, at('2026-11-16T17:30:00Z'), dawn, sunset, dusk, 23 * KT)!
    expect(b.bars.map((x) => x.at.getUTCHours())).toEqual([17, 18, 19, 20, 21, 22])
    expect(b.sunsetAt).toBeGreaterThan(0.7)
    expect(b.duskAt).toBeGreaterThan(b.sunsetAt!)
    expect(b.limitAt).toBeCloseTo((23 * KT) / b.topMps)
  })
  it('starts at civil dawn before it', () => {
    const b = dayBars(hours, at('2026-11-16T05:00:00Z'), dawn, sunset, dusk, null)!
    expect(b.bars[0].at.getUTCHours()).toBe(11)
    expect(b.limitAt).toBeNull()
  })
  it('is null after civil dusk, so the page shows tomorrow', () => {
    expect(dayBars(hours, at('2026-11-16T22:30:00Z'), dawn, sunset, dusk, 10)).toBeNull()
  })
})

describe('the battery, trimmed for the cold', () => {
  it('trims 45 rated minutes at 47 °F (8.3 °C) to 38', () => {
    expect(coldMinutes(45, (47 - 32) / 1.8)).toBe(38)
  })
  it('trims nothing when warm or unknown, and no more than the cap', () => {
    expect(coldTrim(25)).toBe(0)
    expect(coldTrim(null)).toBe(0)
    expect(coldTrim(-40)).toBe(COLD_TRIM_MAX)
  })
})

describe('the GPS row (Batch FIX, Section 6.7)', () => {
  const word = (kp: number) => (kp >= 5 ? 'storm G1' : 'quiet')
  const clock = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  it('says NOAA’s word, the value and when NOAA gave it', () => {
    expect(kpRow({ kp: 2.33, at: kpTime('2026-10-30 09:00:00.000'), kept: false }, word, clock)).toEqual({ big: 'Quiet', small: 'Kp 2 · 9:00' })
    expect(kpRow({ kp: 5.33, at: kpTime('2026-10-30 09:00:00.000'), kept: false }, word, clock)?.big).toBe('Storm G1')
  })
  it('the last value with its age when NOAA does not answer now', () => {
    expect(kpRow({ kp: 2.33, at: kpTime('2026-10-30 09:00:00.000'), kept: true }, word, clock)).toEqual({ big: 'Quiet', small: 'Kp 2 · kept from 9:00' })
  })
  it('no row when this phone has never had one: never "Kp not received"', () => {
    for (const s of ['loading', 'offline', 'missing'] as const) expect(kpRow(s, word, clock)).toBeNull()
  })
  it('reads NOAA’s time tag as UTC, in either form', () => {
    expect(kpTime('2026-10-30 09:00:00.000')?.toISOString()).toBe('2026-10-30T09:00:00.000Z')
    expect(kpTime('2026-10-30T09:00:00')?.toISOString()).toBe('2026-10-30T09:00:00.000Z')
    expect(kpTime('soon')).toBeNull()
  })
})

describe('the sky row (Batch FIX, Section 6.2)', () => {
  it('one word for the cloud, then visibility: never "Little low cloud · low cloud 0%"', () => {
    expect(skyRow(null, null, 3, '10 mi', 0)).toEqual({ big: 'Little cloud', small: 'vis 10 mi' })
    const r = skyRow(null, null, 3, '10 mi', 0)
    expect(`${r.big} ${r.small}`).not.toMatch(/low cloud|\d+%/)
  })
  it('the station’s base when its report is fresh, with its name', () => {
    expect(skyRow(5500, 'KNTU', 60, '10 mi', 0)).toEqual({ big: 'Base 5,500 ft', small: 'vis 10 mi · KNTU' })
  })
  it('rain from 20%, and words for what the forecast did not say', () => {
    expect(skyRow(null, null, 90, '3 mi', 60)).toEqual({ big: 'Overcast', small: 'vis 3 mi · rain 60%' })
    expect(skyRow(null, null, null, null, null)).toEqual({ big: 'Cloud not forecast', small: 'the forecast did not say' })
  })
  it('never says clear (docs/ux-rules.md, rule 12)', () => {
    for (const c of [0, 9, 10, 39, 40, 79, 80, 100]) expect(cloudWords(c)).not.toMatch(/clear/i)
  })
})

describe('the sky estimate', () => {
  it('estimates the base from the dew-point spread, 125 m per °C', () => {
    expect(Math.round(estimatedBaseFt(15, 1.6)!)).toBe(Math.round(13.4 * 125 * 3.28084))
    expect(estimatedBaseFt(null, 3)).toBeNull()
  })
  it('writes visibility as a station does', () => {
    expect(visibilityWords(24_000)).toBe('10 mi')
    expect(visibilityWords(4_900)).toBe('3 mi')
    expect(visibilityWords(800)).toBe('0.5 mi')
    expect(visibilityWords(null)).toBeNull()
  })
})

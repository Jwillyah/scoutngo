import { describe, expect, it } from 'vitest'
import { blowsToward, coldMinutes, coldTrim, COLD_TRIM_MAX, dayBars, estimatedBaseFt, gustAloft, kpCard, kpTime, limitLine, limitRole, visibilityWords, windChip } from './droneNow.ts'

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

describe('the chip', () => {
  const span = (a: Date, b: Date) => `${a.getUTCHours()}–${b.getUTCHours()}`
  const until = (d: Date) => `${d.getUTCHours()}`
  const calm = { kind: 'calm' as const, span: { from: at('2026-11-16T20:00:00Z'), to: at('2026-11-16T21:50:00Z') } }
  it('says gusty now and the calmer window with its strongest wind', () => {
    expect(windChip(at('2026-11-16T17:00:00Z'), calm, 4, 9, 11 * KT, span, until, kt)).toBe('Gusty now · calmer 20–21 (11 kt)')
  })
  it('says calm now when the window has begun', () => {
    expect(windChip(at('2026-11-16T20:30:00Z'), calm, 4, 9, 11 * KT, span, until, kt)).toBe('Calm now until 21')
  })
  it('says nothing with no calm window', () => {
    expect(windChip(at('2026-11-16T17:00:00Z'), { kind: 'windy', overMps: 6, allDay: false }, 4, 9, null, span, until, kt)).toBeNull()
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

describe('the GPS card is never a dash', () => {
  const word = () => 'quiet'
  const clock = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  it('says the value and its age', () => {
    expect(kpCard({ kp: 2.33, at: kpTime('2026-10-30 09:00:00.000') }, word, clock)).toEqual({ big: 'Kp 2 · quiet', line: 'from 9:00' })
  })
  it('says why there is no value, in words', () => {
    for (const s of ['loading', 'offline', 'missing'] as const) {
      const c = kpCard(s, word, clock)
      expect(`${c.big} ${c.line}`).not.toMatch(/—|^-$/)
    }
    expect(kpCard('missing', word, clock).big).toBe('Kp not received')
  })
  it('reads NOAA’s time tag as UTC', () => {
    expect(kpTime('2026-10-30 09:00:00.000')?.toISOString()).toBe('2026-10-30T09:00:00.000Z')
    expect(kpTime('soon')).toBeNull()
  })
})

describe('the sky card', () => {
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

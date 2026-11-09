import { describe, expect, it } from 'vitest'
import { FADE_MS, nowcastAt, nowcastWeight, obsFresh } from '../src/core/nowcast.ts'

/* Batch MAP2, Section 2: 9 Nov, we said 10 kt gusting 17 while KNTU read 12. */
const KT = 0.514444
const T0 = new Date('2026-11-09T17:00:00Z')
const flat = (kt: number, from: number, gustKt: number | null) => () => ({ mps: kt * KT, fromDeg: from, gustMps: gustKt === null ? null : gustKt * KT })

describe('the wind nowcast', () => {
  it('weighs the report fully at its time and not at all three hours on', () => {
    expect(nowcastWeight(T0, T0)).toBe(1)
    expect(nowcastWeight(T0, new Date(T0.getTime() + FADE_MS / 2))).toBeCloseTo(0.5)
    expect(nowcastWeight(T0, new Date(T0.getTime() + FADE_MS))).toBe(0)
    expect(nowcastWeight(T0, new Date(T0.getTime() - 3_600_000))).toBe(0)
  })
  it('at the report, says what the station measured; an hour and a half on, halfway back', () => {
    const obs = { at: T0, mps: 12 * KT, fromDeg: 270, gustMps: null }
    const now = nowcastAt(flat(10, 270, 17), obs, T0)
    expect(now!.mps / KT).toBeCloseTo(12)
    expect(now!.gustMps! / KT).toBeCloseTo(19)
    const later = nowcastAt(flat(10, 270, 17), obs, new Date(T0.getTime() + FADE_MS / 2))
    expect(later!.mps / KT).toBeCloseTo(11)
    expect(nowcastAt(flat(10, 270, 17), obs, new Date(T0.getTime() + FADE_MS))!.mps / KT).toBeCloseTo(10)
  })
  it('blends the direction as wind, not as an angle (350° and 10° meet at north)', () => {
    const got = nowcastAt(flat(10, 350, null), { at: T0, mps: 10 * KT, fromDeg: 10, gustMps: null }, T0)
    expect(Math.min(got!.fromDeg!, 360 - got!.fromDeg!)).toBeLessThan(11)
  })
  it('leans on a report only under an hour old', () => {
    expect(obsFresh({ at: T0, mps: 5, fromDeg: 0, gustMps: null }, new Date(T0.getTime() + 50 * 60_000))).toBe(true)
    expect(obsFresh({ at: T0, mps: 5, fromDeg: 0, gustMps: null }, new Date(T0.getTime() + 70 * 60_000))).toBe(false)
    expect(obsFresh(null, T0)).toBe(false)
  })
})

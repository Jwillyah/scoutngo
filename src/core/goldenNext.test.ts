import { getPosition } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { goldenNext } from './goldenNext.ts'
import { band } from './sunPath.ts'
import { goldenChip } from '../lib/goldenChip.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const alt = (at: Date) => getPosition(at, PIER.lat, PIER.lon).altitude
const golden = (at: Date) => band(alt(at)) === 'golden'

describe('goldenNext at Virginia Beach Fishing Pier, 27 Oct 2026', () => {
  it('at 6:58 AM, before sunrise, counts to the MORNING golden light, not the evening', () => {
    const at = new Date('2026-10-27T10:58:00Z')
    const got = goldenNext(alt, at)
    expect(got.kind).toBe('next')
    if (got.kind !== 'next') return
    /* The field report: "in 23 m". Sunrise there is about 7:21 AM. */
    expect(got.minutesUntil).toBeGreaterThan(10)
    expect(got.minutesUntil).toBeLessThan(40)
    expect(golden(new Date(at.getTime() + got.minutesUntil * 60_000))).toBe(true)
    expect(golden(new Date(at.getTime() + (got.minutesUntil - 1) * 60_000))).toBe(false)
  })

  it('in the morning golden light, says how long is left', () => {
    const before = goldenNext(alt, new Date('2026-10-27T10:58:00Z'))
    if (before.kind !== 'next') throw new Error('expected next')
    const inside = new Date(Date.parse('2026-10-27T10:58:00Z') + (before.minutesUntil + 5) * 60_000)
    const got = goldenNext(alt, inside)
    expect(got.kind).toBe('now')
    if (got.kind !== 'now') return
    expect(got.minutesLeft).toBeGreaterThan(10)
    expect(got.minutesLeft).toBeLessThan(90)
    expect(golden(new Date(inside.getTime() + got.minutesLeft * 60_000))).toBe(false)
  })

  /* 1st St jetty, 27 Oct: the chip said "10 h" at 9:24 AM; evening golden starts about 5:35 PM, 8 h on. */
  it('at 9:24 AM, counts about 8 h to the evening golden light', () => {
    const at = new Date('2026-10-27T13:24:00Z')
    const got = goldenNext(alt, at)
    expect(got.kind).toBe('next')
    if (got.kind !== 'next') return
    expect(got.minutesUntil / 60).toBeGreaterThan(7.5)
    expect(got.minutesUntil / 60).toBeLessThan(8.5)
    expect(goldenChip(got).value).toBe('in 8 h')
  })

  it('at noon, counts to the evening golden light', () => {
    const got = goldenNext(alt, new Date('2026-10-27T16:00:00Z'))
    expect(got.kind).toBe('next')
    if (got.kind !== 'next') return
    expect(got.minutesUntil).toBeGreaterThan(4 * 60)
    expect(got.minutesUntil).toBeLessThan(6 * 60)
  })

  it('at night, counts to the next morning', () => {
    const got = goldenNext(alt, new Date('2026-10-28T04:00:00Z'))
    expect(got.kind).toBe('next')
    if (got.kind !== 'next') return
    expect(got.minutesUntil).toBeGreaterThan(6 * 60)
    expect(got.minutesUntil).toBeLessThan(8 * 60)
  })

  it('a sun that never reaches the band says none', () => {
    expect(goldenNext(() => 40, new Date())).toEqual({ kind: 'none' })
  })
})

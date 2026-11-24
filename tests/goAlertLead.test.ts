import { describe, expect, it } from 'vitest'
import { goAlertDue, moonAlertDue, rainAlertDue, RAIN_ALERT_WITHIN_MS } from '../src/core/goAlert.ts'
import { moonHomeMoment } from '../src/core/moonMoment.ts'
import type { RainNow } from '../src/core/rainNow.ts'
import type { SkyCall } from '../src/core/skyCall.ts'

const TZ = 'America/New_York'
const at = (iso: string) => new Date(`${iso}-05:00`)

/*
 * THE GO ALERT'S LEAD TIME (Batch SIMPLE-3, Section 6.1). 21 Nov: "6:20-6:30"
 * was pushed at 6:52, after the window had ended. The guard was the event's
 * linger, not the window the words printed.
 */
describe('21 Nov sunrise: the window 6:20-6:30 AM', () => {
  const event = at('2026-11-21T06:48:00')
  const c = { kind: 'sunrise', event, read: null, call: 'Go', word: 'color likely', from: at('2026-11-21T06:20:00'), to: at('2026-11-21T06:30:00'), sunDeg: 115, lookDeg: 112, dayIndex: 0 } as SkyCall
  it('says it from 45 minutes before the window starts, with 15 or more to spare', () => {
    expect(goAlertDue(c, at('2026-11-21T05:30:00'), [], TZ)).toBeNull()
    expect(goAlertDue(c, at('2026-11-21T05:36:00'), [], TZ)).toBe('Go now · color likely · 6:20 AM–6:30 AM · look ESE')
    expect(goAlertDue(c, at('2026-11-21T06:05:00'), [], TZ)).not.toBeNull()
  })
  it('never after the window has ended: 6:52 AM says nothing', () => {
    expect(goAlertDue(c, at('2026-11-21T06:30:00'), [], TZ)).toBeNull()
    expect(goAlertDue(c, at('2026-11-21T06:52:00'), [], TZ)).toBeNull()
  })
  it('with no window of its own it falls back to the event and its linger, and still ends', () => {
    const bare = { ...c, from: null, to: null } as SkyCall
    expect(goAlertDue(bare, at('2026-11-21T06:10:00'), [], TZ)).not.toBeNull()
    expect(goAlertDue(bare, at('2026-11-21T08:30:00'), [], TZ)).toBeNull()
  })
})

const rain = (o: Partial<RainNow>): RainNow => ({ state: 'dry', intensity: null, startsAt: null, endsAt: null, endsBy: false, movingTowardDeg: null, bars: [], by: [], ...o })

describe('the rain alert (Section 1b.3)', () => {
  const now = at('2026-11-23T14:00:00')
  it('"Rain starts ~20 min · light" when it starts within half an hour', () => {
    const r = rain({ state: 'starting', intensity: 'light', startsAt: at('2026-11-23T14:20:00') })
    expect(rainAlertDue(r, now, [], TZ)?.text).toBe('Rain starts ~20 min · light')
    expect(rainAlertDue(rain({ state: 'starting', intensity: 'light', startsAt: new Date(now.getTime() + RAIN_ALERT_WITHIN_MS + 60_000) }), now, [], TZ)).toBeNull()
  })
  it('"Rain ending ~11:50 PM" while it rains and the end is near', () => {
    const r = rain({ state: 'raining', intensity: 'light', endsAt: at('2026-11-23T23:50:00') })
    expect(rainAlertDue(r, at('2026-11-23T23:25:00'), [], TZ)?.text).toBe('Rain ending ~11:50 PM')
    expect(rainAlertDue(r, at('2026-11-23T22:30:00'), [], TZ)).toBeNull()
    expect(rainAlertDue({ ...r, endsBy: true }, at('2026-11-23T23:25:00'), [], TZ)?.text).toBe('Rain ending by ~11:50 PM')
  })
  it('once; never for nearby, dry, unknown, or a start with no time', () => {
    const r = rain({ state: 'starting', startsAt: at('2026-11-23T14:20:00') })
    const d = rainAlertDue(r, now, [], TZ)!
    expect(rainAlertDue(r, now, [d.key], TZ)).toBeNull()
    for (const state of ['nearby', 'dry', 'unknown'] as const) expect(rainAlertDue(rain({ state }), now, [], TZ)).toBeNull()
    expect(rainAlertDue(rain({ state: 'starting' }), now, [], TZ)).toBeNull()
    expect(rainAlertDue(rain({ state: 'raining', endsAt: null }), now, [], TZ)).toBeNull()
    expect(rainAlertDue(null, now, [], TZ)).toBeNull()
  })
  it('never says clear or safe', () => {
    const r = rain({ state: 'starting', intensity: 'heavy', startsAt: at('2026-11-23T14:10:00') })
    expect(rainAlertDue(r, now, [], TZ)?.text).not.toMatch(/safe|clear|dry/i)
  })
})

describe('the Supermoon alert (Section 2b.2): 24 Nov, moonrise 4:38 PM ENE', () => {
  const m = moonHomeMoment(at('2026-11-23T22:27:00'), 36.851, -75.98, TZ)
  it('is due from 15 minutes before the rise, once, never after it', () => {
    expect(m?.which).toBe('supermoon')
    const rise = m!.event.at
    expect(moonAlertDue(m, new Date(rise.getTime() - 20 * 60_000), [])).toBeNull()
    const d = moonAlertDue(m, new Date(rise.getTime() - 14 * 60_000), [])
    expect(d?.text).toBe(`Supermoon rising now · look ${m!.event.compass}`)
    expect(moonAlertDue(m, new Date(rise.getTime() - 14 * 60_000), [d!.key])).toBeNull()
    expect(moonAlertDue(m, new Date(rise.getTime() + 60_000), [])).toBeNull()
    expect(moonAlertDue(null, rise, [])).toBeNull()
  })
})

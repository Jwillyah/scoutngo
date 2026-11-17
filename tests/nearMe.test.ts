import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapBanner, markNearMeSeen, nearMeDue, nearStill, pickNear, placesNear, RETURN_AFTER_MS, snoozeNearMe, type NearPlace } from '../src/lib/nearMe.ts'
import { AFTERGLOW_MIN } from '../src/core/afterglow.ts'
import type { Special } from '../src/core/specialLight.ts'

/* "Near you in the next 24 h" on opening (src/lib/nearMe.ts), field test 30 Oct. */
const VB = { lat: 36.8436, lon: -75.9713 }
const RUDEE = { lat: 36.8301, lon: -75.9713 } // 1.5 km south
const WRIGHTSVILLE = { lat: 34.2104, lon: -77.7964 } // about 200 mi away
const NORFOLK = { lat: 36.8508, lon: -76.2859 } // about 17 mi west

describe('which places', () => {
  it('within 25 mi, nearest first, at most two; a spot under 1 km is where you are, by its own name', () => {
    const near = placesNear({ at: VB, name: 'where you are' }, [
      { name: 'Wrightsville Beach', at: WRIGHTSVILLE },
      { name: 'Norfolk', at: NORFOLK },
      { name: 'Rudee Inlet', at: RUDEE },
      { name: 'The pier', at: { lat: 36.8437, lon: -75.9714 } },
    ])
    expect(near.map((p) => p.name)).toEqual(['The pier', 'Rudee Inlet'])
    expect(near.every((p) => p.m <= 25 * 1609.344)).toBe(true)
  })
})

describe('which windows', () => {
  const place: NearPlace = { name: 'Rudee Inlet', at: RUDEE, m: 1500 }
  const NOW = Date.parse('2026-10-30T09:00:00Z')
  const w = (kind: Special['kind'], fromH: number, toH: number): { s: Special; place: NearPlace } => ({ s: { kind, from: new Date(NOW + fromH * 3_600_000), to: new Date(NOW + toH * 3_600_000), agree: 3, of: 5, word: 'possible', why: '' }, place })
  const clock = (d: Date) => `${d.getUTCHours()}:00`

  it('only what touches the next 24 hours, soonest first, three at most, with the place named', () => {
    const items = pickNear([w('rays', 30, 31), w('fog', 20, 22), w('rainbow', -3, -1), w('fog', 1, 3), w('rays', 5, 6), w('rainbow', 8, 9)], NOW, clock, 'coast')
    expect(items.map((i) => i.line)).toEqual(['Fog possible 10:00–12:00 · Rudee Inlet', 'God rays possible 14:00–15:00 · Rudee Inlet', 'Rainbow possible 17:00–18:00 · Rudee Inlet'])
  })

  it('inland, fog is valley fog; a window already open starts now', () => {
    const items = pickNear([w('fog', -1, 2)], NOW, clock, 'inland')
    expect(items[0].line).toBe('Valley fog possible 9:00–11:00 · Rudee Inlet')
    expect(items[0].at.getTime()).toBe(NOW)
  })
})

/* Batch FIX, Section 2.2 (phone, 17 Nov): "Sky color at sunrise possible 6:43 AM" was still over the map at 7:05, and over a layer, beside the status line. */
describe('the banner goes when its event is over, and is the only one', () => {
  const place: NearPlace = { name: 'Virginia Beach', at: VB, m: 0 }
  const sunrise = new Date('2026-11-17T11:43:00Z') /* 6:43 AM EST */
  const sunset = new Date('2026-11-17T21:50:00Z')
  const fire = (event: 'sunrise' | 'sunset', at: Date): { s: Special; place: NearPlace } => ({ s: { kind: 'fire', event, from: at, to: at, agree: 3, of: 5, word: 'possible', why: '' }, place })
  const clock = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(d)
  const asked = Date.parse('2026-11-17T09:00:00Z') /* 4 AM */

  it('the colour at sunrise is offered until the sun is up, and gone at 7:05', () => {
    const items = pickNear([fire('sunrise', sunrise)], asked, clock, 'coast')
    expect(items[0].line).toBe('Sky color at sunrise possible 6:43 AM · Virginia Beach')
    expect(items[0].until.toISOString()).toBe(sunrise.toISOString())
    expect(nearStill(items, sunrise.getTime() - 60_000)).toHaveLength(1)
    expect(nearStill(items, Date.parse('2026-11-17T12:05:00Z'))).toBeNull()
  })

  it('the colour at sunset lasts its afterglow, AFTERGLOW_MIN after the sun is down', () => {
    const items = pickNear([fire('sunset', sunset)], asked, clock, 'coast')
    expect(items[0].until.getTime()).toBe(sunset.getTime() + AFTERGLOW_MIN * 60_000)
    expect(nearStill(items, sunset.getTime() + 60_000)).toHaveLength(1)
    expect(nearStill(items, sunset.getTime() + AFTERGLOW_MIN * 60_000)).toBeNull()
  })

  it('a window goes at its end; the rest of the list stays', () => {
    const fog = { s: { kind: 'fog' as const, from: new Date(asked), to: new Date(asked + 2 * 3_600_000), agree: 3, of: 5, word: 'possible' as const, why: '' }, place }
    const items = pickNear([fog, fire('sunset', sunset)], asked, clock, 'coast')
    expect(nearStill(items, asked + 3 * 3_600_000)?.map((i) => i.line)).toEqual(['Sky color at sunset possible 4:50 PM · Virginia Beach'])
  })

  it('one banner at most: none under a layer, the status line when it must show, else Near you before the soft lines', () => {
    const no = { layerUp: false, hardStatus: false, softStatus: false, near: false }
    expect(mapBanner({ ...no, near: true, hardStatus: true, softStatus: true, layerUp: true })).toBe('none')
    expect(mapBanner({ ...no, near: true, hardStatus: true })).toBe('status')
    expect(mapBanner({ ...no, near: true, softStatus: true })).toBe('near')
    expect(mapBanner({ ...no, softStatus: true })).toBe('status')
    expect(mapBanner(no)).toBe('none')
  })
})

describe('when it shows', () => {
  let store: Record<string, string>
  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] })
  })

  it('on the first open, on a return after six hours, never after "Not now" the same day', () => {
    const t = Date.parse('2026-10-30T12:00:00Z')
    expect(nearMeDue(t, true)).toBe(true)
    markNearMeSeen(t)
    expect(nearMeDue(t + RETURN_AFTER_MS - 60_000, false)).toBe(false)
    expect(nearMeDue(t + RETURN_AFTER_MS + 60_000, false)).toBe(true)
    snoozeNearMe(t)
    expect(nearMeDue(t + 60_000, true)).toBe(false)
    expect(nearMeDue(t + 30 * 3_600_000, true)).toBe(true)
  })

  it('off in Settings is off', () => {
    store['scoutngo.nearMe.v1'] = 'off'
    expect(nearMeDue(Date.now(), true)).toBe(false)
  })
})

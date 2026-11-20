import { describe, expect, it } from 'vitest'
import { fishMoment, glassyMoment, leadWords, moonriseMoment, pickMoment, skyMoment, swellMoment, tileOrder, type Moment } from '../src/core/homeTiles.ts'
import { moonMoments } from '../src/core/moonNights.ts'

/* Batch SIMPLE-2, Section 2: the tiles' order per persona (boards Home_P_Surf, Home_P_Shoot, Home_P_Fish) and the one moment. */
const TZ = 'America/New_York'
const at = (iso: string) => new Date(iso)

describe('tile order per persona', () => {
  it('Surf, Shoot and Fish as the boards draw them', () => {
    expect(tileOrder('surf')).toEqual(['surf', 'tide', 'wind', 'sky', 'fish', 'drone'])
    expect(tileOrder('shoot')).toEqual(['sky', 'drone', 'wind', 'tide', 'surf', 'fish'])
    expect(tileOrder('fish')).toEqual(['fish', 'tide', 'wind', 'water', 'sky', 'surf'])
  })
  it('Drone is the Surf order with Drone second; Just weather is the Shoot order; not asked is Surf', () => {
    expect(tileOrder('drone')).toEqual(['surf', 'drone', 'tide', 'wind', 'sky', 'fish'])
    expect(tileOrder('weather')).toEqual(tileOrder('shoot'))
    expect(tileOrder(null)).toEqual(tileOrder('surf'))
  })
  it('six tiles each, every one once; Fish swaps Drone for Water', () => {
    for (const p of ['surf', 'shoot', 'fish', 'drone', 'weather', null] as const) {
      const o = tileOrder(p)
      expect(o).toHaveLength(6)
      expect(new Set(o).size).toBe(6)
      expect(o.includes('water')).toBe(p === 'fish')
      expect(o.includes('drone')).toBe(p !== 'fish')
    }
  })
})

describe('the moment', () => {
  const now = at('2026-11-19T19:30:00Z') /* 2:30 PM EST */
  const sunset = at('2026-11-19T21:52:00Z')
  const sky = skyMoment({ kind: 'sunset', event: sunset, call: 'Go', from: at('2026-11-19T21:40:00Z'), lookDeg: 245 }, now, TZ)
  const surf: Moment = { kind: 'glassy', at: at('2026-11-20T11:00:00Z'), eyebrow: 'Glassy', line: '1–2 ft', target: 'surf' }

  it('Sky only for a Likely call (Go) within 3 h', () => {
    expect(sky?.line).toBe('Sunset color likely 4:52 PM · look WSW')
    expect(sky?.eyebrow).toBe('Coming up · 2 h 22 m')
    expect(skyMoment({ kind: 'sunset', event: sunset, call: 'Maybe', from: null, lookDeg: 245 }, now, TZ)).toBeNull()
    expect(skyMoment({ kind: 'sunset', event: sunset, call: 'Go', from: null, lookDeg: 245 }, at('2026-11-19T18:00:00Z'), TZ)).toBeNull()
    expect(skyMoment(null, now, TZ)).toBeNull()
  })
  it('the persona decides which wins; nothing worth it is no card', () => {
    expect(pickMoment([sky, surf], 'surf')?.kind).toBe('glassy')
    expect(pickMoment([sky, surf], 'shoot')?.kind).toBe('sky')
    expect(pickMoment([sky, surf], 'weather')?.kind).toBe('sky')
    expect(pickMoment([sky, surf], 'drone')?.kind).toBe('sky')
    expect(pickMoment([surf], 'shoot')?.kind).toBe('glassy')
    expect(pickMoment([null, null], 'surf')).toBeNull()
    expect(pickMoment([], null)).toBeNull()
  })
  it('glassy: the next daylight run under 5 kt or offshore, within 12 h, at a beach only', () => {
    const hours = Array.from({ length: 24 }, (_, k) => ({ at: new Date(now.getTime() + k * 3_600_000), mps: k >= 16 && k <= 18 ? 1.5 : 6, fromDeg: 90 }))
    const daylight = (t: Date) => t.getUTCHours() >= 11 || t.getUTCHours() < 22
    /* 16 h on is past 12 h: nothing. */
    expect(glassyMoment({ hours, facing: 90, daylight, now, timeZone: TZ })).toBeNull()
    const soon = hours.map((h, k) => ({ ...h, mps: k >= 2 && k <= 3 ? 1.5 : 6 }))
    const g = glassyMoment({ hours: soon, facing: 90, daylight, now, timeZone: TZ, sizeAt: () => '1–2 ft' })
    expect(g?.eyebrow).toBe('Glassy · 4–6 PM')
    expect(g?.line).toBe('1–2 ft, light wind')
    expect(glassyMoment({ hours: soon, facing: null, daylight, now, timeZone: TZ })).toBeNull()
    /* Offshore at 6 m/s is glassy (the beach faces east, the wind from the west). */
    const off = hours.map((h, k) => ({ ...h, fromDeg: k === 1 ? 270 : 90 }))
    expect(glassyMoment({ hours: off, facing: 90, daylight, now, timeZone: TZ })?.line).toBe('offshore')
  })
  it('fish: the calm-water run when it starts within 2 h, never one already going or later', () => {
    const turn = { kind: 'low' as const, at: at('2026-11-19T22:48:00Z') }
    expect(fishMoment({ from: at('2026-11-19T21:00:00Z'), to: at('2026-11-20T00:00:00Z') }, turn, now, TZ)?.line).toBe('4–7 PM · low tide 5:48 PM')
    expect(fishMoment({ from: at('2026-11-19T22:00:00Z'), to: at('2026-11-20T00:00:00Z') }, turn, now, TZ)).toBeNull()
    expect(fishMoment({ from: at('2026-11-19T19:00:00Z'), to: at('2026-11-20T00:00:00Z') }, turn, now, TZ)).toBeNull()
    expect(fishMoment(null, turn, now, TZ)).toBeNull()
  })
  it('swell: the first Fun hour to come within a day; not when it is on now', () => {
    expect(swellMoment(at('2026-11-20T13:00:00Z'), '2–3 ft', now, TZ)?.eyebrow).toBe('Surf picks up · 8 AM')
    expect(swellMoment('now', '2–3 ft', now, TZ)).toBeNull()
    expect(swellMoment(at('2026-11-21T13:00:00Z'), null, now, TZ)).toBeNull()
  })
  it('moonrise: a Big moonrise on today’s date only (Chic’s Beach, Tue 24 Nov)', () => {
    const lat = 36.92
    const lon = -76.1
    const tue = at('2026-11-24T14:00:00Z')
    const m = moonriseMoment(moonMoments(tue, lat, lon, TZ), '2026-11-24', TZ)
    expect(m?.kind).toBe('moonrise')
    expect(m?.eyebrow).toMatch(/^Big moonrise · 4:3\d PM$/)
    /* The moon's card opens the Sky page on Night, where the moon's nights are (App tileOpen 'sky-night'). */
    expect(m?.target).toBe('sky-night')
    /* The day before has no Big moonrise of its own today. */
    expect(moonriseMoment(moonMoments(at('2026-11-20T14:00:00Z'), lat, lon, TZ), '2026-11-20', TZ)).toBeNull()
  })
  it('lead words', () => {
    expect(leadWords(25 * 60_000)).toBe('25 m')
    expect(leadWords(70 * 60_000)).toBe('1 h 10 m')
    expect(leadWords(120 * 60_000)).toBe('2 h')
  })
})

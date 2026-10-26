import { getMoonPosition } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { distanceMeters } from './geo.ts'
import { CLEAR_ALTITUDE, moonrisePlan, type MoonriseInput, type Shot } from './moonrisePlan.ts'
import { moonriseIcs } from './moonriseIcs.ts'
import { EYE_HEIGHT_METERS } from './sightline.ts'
import { formatClock } from './timezone.ts'

const TZ = 'America/New_York'
const VB = { lat: 36.85, lon: -75.975 }
const PIER = { lat: 36.8466, lon: -75.9737 }
const BASE: MoonriseInput = {
  venue: VB,
  timeZone: TZ,
  from: new Date('2026-10-25T16:00:00Z'),
  lenses: [
    { id: 'sony-10-18', name: 'Sony 10-18 f4', minFocalLength: 10, maxFocalLength: 18 },
    { id: 'sony-70-200', name: 'Sony 70-200 f2.8 GM II', minFocalLength: 70, maxFocalLength: 200 },
    { id: 'sony-200-600', name: 'Sony 200-600', minFocalLength: 200, maxFocalLength: 600 },
  ],
  drone: 'DJI Air 3S',
  droneCeiling: { feet: 200 },
  target: { at: PIER, heightMeters: 15 },
}
const plan = (input: MoonriseInput = BASE) => {
  const r = moonrisePlan(input)
  if (r.status !== 'ok') throw new Error(r.reason)
  return r.plan
}
const shot = <K extends Shot['kind']>(kind: K, input?: MoonriseInput) => plan(input).shots.find((s) => s.kind === kind) as Extract<Shot, { kind: K }>

describe('the night', () => {
  it('around the next full moon, the night the moon rises closest before sunset: 25 October at Virginia Beach', () => {
    const p = plan()
    expect(p.date).toBe('2026-10-25')
    expect(formatClock(p.moonrise, TZ, 12)).toBe('5:41 PM')
    expect(p.moonrise.getTime()).toBeLessThan(p.sunset.getTime())
    /* The 26th rises after sunset and the 27th later still: considered, not chosen. */
    expect(p.nights.map((n) => n.date)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27'])
    expect(p.nights.find((n) => n.date === '2026-10-26')!.leadMinutes).toBeLessThan(0)
  })

  it('says when the moon clears 2 degrees, and it is really 2 degrees up then', () => {
    const p = plan()
    expect(p.clears).not.toBeNull()
    expect(getMoonPosition(p.clears!, VB.lat, VB.lon).altitude).toBeGreaterThanOrEqual(CLEAR_ALTITUDE)
    expect(getMoonPosition(new Date(p.clears!.getTime() - 60_000), VB.lat, VB.lon).altitude).toBeLessThan(CLEAR_ALTITUDE)
  })

  it('has civil dusk after sunset and golden hour before it', () => {
    const p = plan()
    expect(p.civilDusk!.getTime()).toBeGreaterThan(p.sunset.getTime())
    expect(p.goldenHour!.getTime()).toBeLessThan(p.sunset.getTime())
  })
})

describe('the night, asked late', () => {
  it('four hours before the full moon, it is still this full moon, not next month’s', () => {
    /* 25 October, 8:40 PM EDT: tonight's moonrise has gone, the full moon is at 12:13 AM. */
    const p = plan({ ...BASE, from: new Date('2026-10-26T00:40:00Z') })
    expect(p.date).toBe('2026-10-26')
    expect(p.nights.map((n) => n.date)).not.toContain('2026-10-25')
  })
})

describe('the four shots, built by code', () => {
  it('in order: wide opener, line-up, mid, drone', () => {
    expect(plan().shots.map((s) => s.kind)).toEqual(['wide', 'lineup', 'mid', 'drone'])
  })

  it('the wide opener is the widest lens at its widest, from sunset', () => {
    const w = shot('wide')
    expect(w.lens?.id).toBe('sony-10-18')
    expect(w.focal).toBe(10)
    expect(w.from.getTime()).toBe(plan().sunset.getTime())
  })

  it('the line-up stands where the target hides the moon at 2 degrees, and moves in as it climbs', () => {
    const l = shot('lineup')
    expect(l.lens?.id).toBe('sony-200-600')
    expect(l.focal).toBe(600)
    const first = l.stands![0]
    expect(first.altitude).toBe(2)
    /* tan(2°) = (15 - eye) / distance. */
    expect(first.fromTargetMeters).toBeCloseTo((15 - EYE_HEIGHT_METERS) / Math.tan((2 * Math.PI) / 180), 6)
    expect(distanceMeters(PIER, first.stand)).toBeCloseTo(first.fromTargetMeters, 0)
    /* Standing on the far side of the target from the moon. */
    const moonAz = getMoonPosition(first.at, VB.lat, VB.lon).azimuth
    expect(Math.abs(((first.fromTargetBearing - moonAz + 540) % 360) - 180)).toBeGreaterThan(179)
    const metres = l.stands!.map((s) => s.fromTargetMeters)
    expect([...metres].sort((a, b) => b - a)).toEqual(metres)
  })

  it('the line-up asks for the target, or its height, rather than guessing', () => {
    expect(shot('lineup', { ...BASE, target: null }).reason).toContain('Pick a target')
    expect(shot('lineup', { ...BASE, target: { at: PIER, heightMeters: null } }).reason).toContain('height')
  })

  it('the mid is the 70-200', () => {
    expect(shot('mid').lens?.id).toBe('sony-70-200')
  })

  it('settings come from the exposure table: the moon row, and none for a twilight landscape', () => {
    expect(shot('lineup').exposure).toEqual({ iso: 100, aperture: 11, seconds: 1 / 125 })
    expect(shot('wide').exposure).toBeNull()
  })

  it('the drone flies only with the switch on, under the ceiling, from sunset with no ND', () => {
    const d = shot('drone')
    expect(d.altitudeFeet).toBe(200)
    expect(d.from.getTime()).toBe(plan().sunset.getTime())
    expect(d.nd).toBeNull()
    const off = shot('drone', { ...BASE, droneCeiling: { reason: 'the LAANC switch is off at this spot.' } })
    expect(off.altitudeFeet).toBeNull()
    expect(off.reason).toContain('LAANC switch is off')
  })
})

describe('the calendar file', () => {
  const ics = moonriseIcs(plan(), 'the list')
  it('alarms at golden hour start and 10 minutes before moonrise', () => {
    expect(ics).toContain('SUMMARY:Golden hour starts: set up for the moonrise')
    expect(ics).toContain('TRIGGER:PT0M')
    expect(ics).toContain('TRIGGER:-PT10M')
    expect(ics).toContain('SUMMARY:Moonrise 5:41 PM')
  })
})

import { describe, expect, it } from 'vitest'
import { getTimes } from 'suncalc'
import { droneWindow, droneWindowLine } from '../src/core/droneWindow.ts'
import { droneTag, type WindHourIn } from '../src/core/briefing.ts'
import { formatClock } from '../src/core/timezone.ts'

/* Batch M, Section 4: at 8 AM on 8 Nov the drone line said "No light to fly for". */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const TZ = 'America/New_York'
/* Local midnight, 8 Nov 2026 (EST, UTC-5). */
const DAY = new Date('2026-11-08T05:00:00Z')
const AT_8AM = new Date('2026-11-08T13:00:00Z')
const LIMIT = 12 // m/s, the Air 3S rating; calm under half, 6 m/s
const hourAt = (h: number) => new Date(DAY.getTime() + h * 3_600_000)
const day = (high: (h: number) => number | null): WindHourIn[] => Array.from({ length: 24 }, (_, h) => ({ at: hourAt(h), mps: 3, gustMps: 5, fromDeg: 270, highMps: high(h) }))
const kt = (mps: number) => `${Math.floor(mps * (3600 / 1852))} kt`
const short = (d: Date) => formatClock(d, TZ, 12).replace(/ [AP]M$/, '')

describe('the drone line: the next calm window and golden light', () => {
  const t = getTimes(new Date(DAY.getTime() + 12 * 3_600_000), PIER.lat, PIER.lon)

  it('at 8 AM: calm 10 AM to 1 PM, then the evening golden light', () => {
    /* Windy at 400 ft until 10, calm 10-12, windy again from 1. */
    const wind = day((h) => (h >= 10 && h <= 12 ? 4 : 9))
    /* The calm hours are the card's own 'Light wind'. */
    expect(droneTag(4, LIMIT)).toBe('Light wind')
    expect(droneTag(9, LIMIT)).not.toBe('Light wind')
    const w = droneWindow(wind, LIMIT, DAY, PIER.lat, PIER.lon, AT_8AM)
    expect(w.calm).toEqual({ kind: 'calm', span: { from: hourAt(10), to: hourAt(13) } })
    /* Morning golden is over by 8 AM: the evening's, 6° up to sunset. */
    expect(w.golden).toEqual({ from: t.goldenHour, to: t.sunset })
    const line = droneWindowLine(w, TZ, kt)
    expect(line).toBe(`Calm 10 AM–1 PM · golden ${short(t.goldenHour as Date)}–${short(t.sunset as Date)}`)
    expect(line).toMatch(/^Calm 10 AM–1 PM · golden 4:\d\d–4:5\d$/)
    expect(line).not.toMatch(/No light/)
  })

  it('no calm hour today: says the wind, as a fact', () => {
    const w = droneWindow(day(() => 9), LIMIT, DAY, PIER.lat, PIER.lon, AT_8AM)
    expect(w.calm).toEqual({ kind: 'windy', overMps: 6, allDay: false })
    expect(droneWindowLine(w, TZ, kt)).toMatch(/^Wind over 11 kt at 400 ft rest of the day · golden 4:\d\d–4:5\d$/)
    /* Before sunrise, all of the daylight is ahead. */
    const early = droneWindow(day(() => 9), LIMIT, DAY, PIER.lat, PIER.lon, hourAt(5))
    expect(droneWindowLine(early, TZ, kt)).toMatch(/^Wind over 11 kt at 400 ft all day · golden \d:\d\d–\d:\d\d$/)
    expect(early.golden).toEqual({ from: t.sunrise, to: t.goldenHourEnd })
  })

  it('a calm hour already over is not offered; a window runs to the next windy hour', () => {
    const wind = day((h) => (h === 7 || (h >= 14 && h <= 15) ? 3 : 9))
    const w = droneWindow(wind, LIMIT, DAY, PIER.lat, PIER.lon, AT_8AM)
    expect(w.calm).toEqual({ kind: 'calm', span: { from: hourAt(14), to: hourAt(16) } })
  })

  it('unknown is not calm: a gap in the 400 ft forecast says so', () => {
    const w = droneWindow(day((h) => (h < 12 ? 9 : null)), LIMIT, DAY, PIER.lat, PIER.lon, AT_8AM)
    expect(w.calm).toEqual({ kind: 'unknown' })
    expect(droneWindowLine(w, TZ, kt)).toMatch(/^Wind at 400 ft not forecast · golden /)
  })

  it('a window sunset cuts short ends at sunset; after sunset there is no daylight left', () => {
    const w = droneWindow(day((h) => (h >= 16 ? 3 : 9)), LIMIT, DAY, PIER.lat, PIER.lon, AT_8AM)
    expect(w.calm).toEqual({ kind: 'calm', span: { from: hourAt(16), to: t.sunset } })
    expect(droneWindowLine(w, TZ, kt)).toMatch(/^Calm 4 PM–4:5\d PM · golden /)
    const night = droneWindow(day(() => 3), LIMIT, DAY, PIER.lat, PIER.lon, hourAt(20))
    expect(night).toEqual({ calm: { kind: 'dark' }, golden: null })
    expect(droneWindowLine(night, TZ, kt)).toBe('Sun down')
  })

  it('no wind rating: golden light alone', () => {
    const w = droneWindow(day(() => 3), null, DAY, PIER.lat, PIER.lon, AT_8AM)
    expect(w.calm).toEqual({ kind: 'no-rating' })
    expect(droneWindowLine(w, TZ, kt)).toMatch(/^Golden 4:\d\d–4:5\d$/)
  })
})

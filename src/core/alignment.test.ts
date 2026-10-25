import { getPosition } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { findAlignments, HORIZON_ALTITUDE, targetAltitude } from './alignment.ts'
import { destinationPoint, type LatLon } from './geo.ts'

const HERE: LatLon = { lat: 38.364236, lon: -75.605912 }
const FROM = new Date('2026-10-26T12:00:00Z')
const DAY = 86_400_000

/* The 2027 equinoxes: 20 March and 23 September. */
const EQUINOXES = [new Date('2027-03-20T12:00:00Z'), new Date('2027-09-23T12:00:00Z')]
const daysFromEquinox = (at: Date) => Math.min(...EQUINOXES.map((e) => Math.abs(at.getTime() - e.getTime()) / DAY))

describe('the sun setting behind a target due west', () => {
  const west = destinationPoint(HERE, 270, 1000)
  const found = findAlignments({ observer: HERE, target: west, body: 'sun', mode: 'set', from: FROM })

  /*
   * THE CHECK. The sun sets due west only near the equinoxes, so every hit
   * must be within a few days of one, and there must be hits near both.
   * A search that returned nothing, or that matched every evening, fails.
   */
  it('finds sunsets only near the equinoxes, near both of them', () => {
    expect(found.length).toBeGreaterThan(0)
    for (const a of found) expect(daysFromEquinox(a.at)).toBeLessThan(8)
    expect(found.some((a) => a.at.getUTCMonth() === 2)).toBe(true)
    expect(found.some((a) => a.at.getUTCMonth() === 8)).toBe(true)
  })

  it('reports sunsets, at the horizon, inside the bearing tolerance', () => {
    for (const a of found) {
      expect(a.direction).toBe('setting')
      expect(a.altitude).toBeCloseTo(HORIZON_ALTITUDE.sun, 2)
      expect(Math.abs(a.offsetDegrees)).toBeLessThanOrEqual(1.27)
    }
  })

  it('does not call a sunrise a sunset', () => {
    const rises = findAlignments({ observer: HERE, target: west, body: 'sun', mode: 'rise', from: FROM })
    expect(rises).toEqual([])
  })
})

describe('the sun at a height', () => {
  const south = destinationPoint(HERE, 180, 1000)

  it('never sits 10 degrees up due south at 38 N: a real empty answer', () => {
    expect(findAlignments({ observer: HERE, target: south, body: 'sun', mode: 'height', altitudeDeg: 10, from: FROM })).toEqual([])
  })

  /*
   * DUE SOUTH IS WHERE THE SUN PEAKS, so at its peak height it TOUCHES the
   * altitude rather than crossing it, and a crossing search rightly finds
   * nothing there. A real height question names a bearing the sun passes
   * through at that height: here, wherever it comes down through 30 degrees
   * on the afternoon of 15 November.
   */
  it('finds the afternoon the sun comes down through 30 degrees behind a target', () => {
    const day = new Date('2026-11-15T17:00:00Z').getTime()
    let azimuth = -1
    for (let t = day; t < day + 6 * 3_600_000; t += 30_000) {
      const now = getPosition(new Date(t), HERE.lat, HERE.lon)
      const next = getPosition(new Date(t + 30_000), HERE.lat, HERE.lon)
      if (now.altitude >= 30 && next.altitude < 30) {
        azimuth = now.azimuth
        break
      }
    }
    expect(azimuth).toBeGreaterThan(180)
    const target = destinationPoint(HERE, azimuth, 1000)
    const found = findAlignments({ observer: HERE, target, body: 'sun', mode: 'height', altitudeDeg: 30, from: FROM })
    expect(found.some((a) => Math.abs(a.at.getTime() - day) < 3 * DAY)).toBe(true)
    for (const a of found) expect(a.altitude).toBeCloseTo(30, 2)
  })
})

describe('the moon rising behind a target', () => {
  it('finds moonrises on that bearing, and only there', () => {
    const east = destinationPoint(HERE, 90, 2000)
    const found = findAlignments({ observer: HERE, target: east, body: 'moon', mode: 'rise', from: FROM })
    expect(found.length).toBeGreaterThan(0)
    for (const a of found) {
      expect(a.direction).toBe('rising')
      expect(Math.abs(a.offsetDegrees)).toBeLessThanOrEqual(1.26)
      expect(a.altitude).toBeCloseTo(HORIZON_ALTITUDE.moon, 2)
    }
  })
})

describe('the altitude of a target', () => {
  it('is the angle to its top from eye height', () => {
    const lighthouse = destinationPoint(HERE, 90, 1000)
    expect(targetAltitude(HERE, lighthouse, 41.6)).toBeCloseTo((Math.atan(40 / 1000) * 180) / Math.PI, 2)
  })
})

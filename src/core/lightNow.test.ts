import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { lightNow, PERSON_HEIGHT_METERS } from './lightNow.ts'

const lat = 36.84658
const lon = -75.97666

describe('the light now', () => {
  it('in the afternoon: daylight, and golden hour next, at suncalc golden hour to the minute', () => {
    const at = new Date('2026-10-25T20:00:00Z')
    const read = lightNow(at, lat, lon)
    expect(read.band).toBe('day')
    expect(read.next?.band).toBe('golden')
    const golden = getTimes(at, lat, lon).goldenHour!
    expect(Math.abs((read.next?.minutes ?? 0) - (golden.getTime() - at.getTime()) / 60_000)).toBeLessThanOrEqual(2)
  })

  it("throws a person's shadow away from the sun, longer when the sun is lower", () => {
    const high = lightNow(new Date('2026-10-25T17:00:00Z'), lat, lon)
    const low = lightNow(new Date('2026-10-25T21:30:00Z'), lat, lon)
    expect(high.personShadow?.lengthMeters ?? 0).toBeGreaterThan(PERSON_HEIGHT_METERS)
    expect(low.personShadow?.lengthMeters ?? 0).toBeGreaterThan(high.personShadow?.lengthMeters ?? 0)
    expect(Math.abs(((high.personShadow?.bearing ?? 0) - high.azimuth + 360) % 360 - 180)).toBeLessThan(0.001)
  })

  it('has no shadow with the sun down', () => {
    expect(lightNow(new Date('2026-10-26T03:00:00Z'), lat, lon).personShadow).toBeNull()
  })
})

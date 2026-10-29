import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { nextSunrise, sunriseOn, SUNRISE_AGREE_MIN } from './sunrise.ts'

describe('sunrise, two ways', () => {
  it("our calibrated horizon crossing and suncalc's analytic sunrise agree, Virginia Beach, every day for a month", () => {
    for (let d = 0; d < 30; d += 1) {
      const day = new Date(Date.UTC(2026, 9, 27 + d, 16))
      const date = day.toISOString().slice(0, 10)
      const ours = sunriseOn(date, 36.8436, -75.9713, 'America/New_York')
      const theirs = getTimes(day, 36.8436, -75.9713).sunrise
      expect(ours).not.toBeNull()
      expect(Math.abs((ours?.getTime() ?? 0) - (theirs?.getTime() ?? 0)) / 60_000).toBeLessThan(SUNRISE_AGREE_MIN)
    }
  })

  it('a day with no sunrise (polar night) is null', () => {
    expect(sunriseOn('2026-12-21', 78.22, 15.65, 'Arctic/Longyearbyen')).toBeNull()
  })
})

describe('the next sunrise', () => {
  const VB = { lat: 36.8435575, lon: -75.9713104, tz: 'America/New_York' }
  it("is today's when it is still to come, and tomorrow's once it has passed", () => {
    const today = sunriseOn('2026-10-29', VB.lat, VB.lon, VB.tz)!
    const tomorrow = sunriseOn('2026-10-30', VB.lat, VB.lon, VB.tz)!
    expect(nextSunrise(new Date(today.getTime() - 3_600_000), VB.lat, VB.lon, VB.tz)?.getTime()).toBe(today.getTime())
    expect(nextSunrise(new Date(today.getTime() + 60_000), VB.lat, VB.lon, VB.tz)?.getTime()).toBe(tomorrow.getTime())
  })
})

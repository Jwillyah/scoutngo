import { describe, expect, it } from 'vitest'
import { eventTabLabel, MORNING_LEAD_MIN, skyDayTimes, skyOpenTab } from './skyTabs.ts'

/*
 * Batch SIMPLE-2, Section 4: the Sky page opens on Tonight before sunset, on
 * the morning's tab before sunrise, on Now in the day's middle and on Night
 * after dark. Chic's Beach, Thu 19 Nov 2026: sunrise 6:47 AM, sunset 4:52 PM,
 * civil dusk 5:20 PM (suncalc, EST).
 */
const LAT = 36.92
const LON = -76.1
const TZ = 'America/New_York'
const at = (iso: string) => new Date(iso)
const day = skyDayTimes(at('2026-11-19T15:00:00Z'), LAT, LON, TZ)
const open = (iso: string) => skyOpenTab(at(iso), skyDayTimes(at(iso), LAT, LON, TZ))

describe('the day the rule reads', () => {
  it("is the venue's own: sunrise 6:47 AM, sunset 4:52 PM, dusk 5:20 PM EST", () => {
    expect(day.sunrise?.toISOString().slice(0, 16)).toBe('2026-11-19T11:47')
    expect(day.sunset?.toISOString().slice(0, 16)).toBe('2026-11-19T21:52')
    expect(day.dusk?.toISOString().slice(0, 16)).toBe('2026-11-19T22:20')
  })
  it('is the same day before sunrise and late in the evening', () => {
    expect(skyDayTimes(at('2026-11-19T06:00:00Z'), LAT, LON, TZ).sunrise?.toISOString().slice(0, 13)).toBe('2026-11-19T11')
    expect(skyDayTimes(at('2026-11-20T04:30:00Z'), LAT, LON, TZ).sunset?.toISOString().slice(0, 13)).toBe('2026-11-19T21')
  })
})

describe('the tab the Sky page opens on', () => {
  it('Night through the small hours, until 90 minutes before sunrise', () => {
    expect(open('2026-11-19T06:00:00Z')).toBe('night') // 1:00 AM
    expect(open('2026-11-19T10:15:00Z')).toBe('night') // 5:15 AM
  })
  it('the morning from 90 minutes before sunrise to 30 after', () => {
    expect(MORNING_LEAD_MIN).toBe(90)
    expect(open('2026-11-19T10:18:00Z')).toBe('tmrw-am') // 5:18 AM
    expect(open('2026-11-19T12:16:00Z')).toBe('tmrw-am') // 7:16 AM
  })
  it('Now in the day’s middle', () => {
    expect(open('2026-11-19T12:18:00Z')).toBe('now') // 7:18 AM
    expect(open('2026-11-19T15:30:00Z')).toBe('now') // 10:30 AM
    expect(open('2026-11-19T20:21:00Z')).toBe('now') // 3:21 PM
  })
  it('Tonight from 90 minutes before sunset to civil dusk', () => {
    expect(open('2026-11-19T20:24:00Z')).toBe('tonight') // 3:24 PM
    expect(open('2026-11-19T21:52:00Z')).toBe('tonight') // sunset
    expect(open('2026-11-19T22:19:00Z')).toBe('tonight') // 5:19 PM
  })
  it('Night after civil dusk', () => {
    expect(open('2026-11-19T22:21:00Z')).toBe('night') // 5:21 PM
    expect(open('2026-11-20T04:00:00Z')).toBe('night') // 11:00 PM
  })
  it('Now on a day with no sunrise or sunset: nothing to lead up to', () => {
    expect(skyOpenTab(at('2026-12-19T12:00:00Z'), skyDayTimes(at('2026-12-19T12:00:00Z'), 78.2, 15.6, 'Arctic/Longyearbyen'))).toBe('now')
  })
  it('every minute of a day opens one of the four, in the rule’s order', () => {
    const seen: string[] = []
    for (let t = Date.parse('2026-11-19T05:00:00Z'); t < Date.parse('2026-11-20T05:00:00Z'); t += 60_000) {
      const tab = skyOpenTab(new Date(t), day)
      if (seen[seen.length - 1] !== tab) seen.push(tab)
    }
    expect(seen).toEqual(['night', 'tmrw-am', 'now', 'tonight', 'night'])
  })
})

describe('the event tabs say the day the event is on', () => {
  const sunset = at('2026-11-19T21:52:00Z')
  const sunrise = at('2026-11-20T11:48:00Z')
  it('Tonight and Sunrise in the afternoon', () => {
    expect(eventTabLabel('sunset', sunset, at('2026-11-19T19:00:00Z'), TZ)).toBe('Tonight')
    expect(eventTabLabel('sunrise', sunrise, at('2026-11-19T19:00:00Z'), TZ)).toBe('Sunrise')
  })
  it('This AM before sunrise, Tmrw PM for the next sunset after dark', () => {
    expect(eventTabLabel('sunrise', sunrise, at('2026-11-20T10:00:00Z'), TZ)).toBe('This AM')
    expect(eventTabLabel('sunset', at('2026-11-20T21:52:00Z'), at('2026-11-20T02:00:00Z'), TZ)).toBe('Tmrw PM')
  })
  it('no event: the board’s words', () => {
    expect(eventTabLabel('sunset', null, sunset, TZ)).toBe('Tonight')
    expect(eventTabLabel('sunrise', null, sunset, TZ)).toBe('Sunrise')
  })
})

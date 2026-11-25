import { describe, expect, it } from 'vitest'
import { eventDayWord, MORNING_LEAD_MIN, SKY_TAB_IDS, SKY_TAB_LABEL, skyDayTimes, skyOpenTab } from './skyTabs.ts'

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
    expect(open('2026-11-19T10:18:00Z')).toBe('sunrise') // 5:18 AM
    expect(open('2026-11-19T12:16:00Z')).toBe('sunrise') // 7:16 AM
  })
  it('Now in the day’s middle', () => {
    expect(open('2026-11-19T12:18:00Z')).toBe('now') // 7:18 AM
    expect(open('2026-11-19T15:30:00Z')).toBe('now') // 10:30 AM
    expect(open('2026-11-19T20:21:00Z')).toBe('now') // 3:21 PM
  })
  it('Tonight from 90 minutes before sunset to civil dusk', () => {
    expect(open('2026-11-19T20:24:00Z')).toBe('sunset') // 3:24 PM
    expect(open('2026-11-19T21:52:00Z')).toBe('sunset') // sunset
    expect(open('2026-11-19T22:19:00Z')).toBe('sunset') // 5:19 PM
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
    expect(seen).toEqual(['night', 'sunrise', 'now', 'sunset', 'night'])
  })
})

/*
 * Batch SIMPLE-3, Section 3.1: the pills are fixed, Now · Sunrise · Sunset ·
 * Night, and the day goes in the eyebrow. Walked over a whole day, minute by
 * minute: the pills never change, the eyebrow names the day each event is on.
 */
describe('fixed tabs, the day in the eyebrow', () => {
  const sunset19 = at('2026-11-19T21:52:00Z')
  const sunrise20 = at('2026-11-20T11:48:00Z')
  const sunrise19 = at('2026-11-19T11:47:00Z')
  it('the pills read Now · Sunrise · Sunset · Night, in that order', () => {
    expect(SKY_TAB_IDS.map((id) => SKY_TAB_LABEL[id])).toEqual(['Now', 'Sunrise', 'Sunset', 'Night'])
  })
  it('every opening tab is one of the four fixed pills, over a whole day', () => {
    for (let t = Date.parse('2026-11-19T05:00:00Z'); t < Date.parse('2026-11-20T05:00:00Z'); t += 15 * 60_000) expect(SKY_TAB_IDS).toContain(skyOpenTab(new Date(t), day))
  })
  it('the afternoon: Tonight for the sunset, Tomorrow AM for the sunrise', () => {
    expect(eventDayWord('sunset', sunset19, at('2026-11-19T19:00:00Z'), TZ)).toBe('Tonight')
    expect(eventDayWord('sunrise', sunrise20, at('2026-11-19T19:00:00Z'), TZ)).toBe('Tomorrow AM')
  })
  it('before dawn: This morning; after dark: Tomorrow PM for the next sunset', () => {
    expect(eventDayWord('sunrise', sunrise19, at('2026-11-19T09:00:00Z'), TZ)).toBe('This morning')
    expect(eventDayWord('sunset', at('2026-11-20T21:52:00Z'), at('2026-11-20T02:00:00Z'), TZ)).toBe('Tomorrow PM')
  })
  it('a later day is said by its date, never by a day word', () => {
    expect(eventDayWord('sunrise', at('2026-11-21T11:51:00Z'), at('2026-11-19T19:00:00Z'), TZ)).toBe('Sat 21 Nov')
  })
  it('the word follows the clock over a day: the sunset is Tonight from midnight to midnight, then Tomorrow PM the evening before', () => {
    const seen = new Set<string>()
    for (let t = Date.parse('2026-11-18T05:00:00Z'); t < Date.parse('2026-11-20T05:00:00Z'); t += 30 * 60_000) seen.add(eventDayWord('sunset', sunset19, new Date(t), TZ))
    expect([...seen]).toEqual(['Tomorrow PM', 'Tonight'])
  })
  it('no event: the kind, never a day', () => {
    expect(eventDayWord('sunset', null, sunset19, TZ)).toBe('Sunset')
    expect(eventDayWord('sunrise', null, sunset19, TZ)).toBe('Sunrise')
  })
})

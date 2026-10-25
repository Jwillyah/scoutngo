import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { shootDayIcs, shootMoments } from './shootIcs.ts'

/* Atlantic Park, an evening shoot on 25 October 2026: 17:00 to 18:30 EDT. */
const evening = {
  name: 'Atlantic Park',
  lat: 36.84658,
  lon: -75.97666,
  start: new Date('2026-10-25T21:00:00Z'),
  end: new Date('2026-10-25T22:30:00Z'),
  stamp: new Date('2026-10-25T12:00:00Z'),
  uid: 'plan-1',
}

describe('the shoot day calendar', () => {
  it('puts the alarms at the computed moments, not at round times', () => {
    const t = getTimes(new Date('2026-10-25T21:45:00Z'), evening.lat, evening.lon)
    const m = shootMoments(evening)
    expect(m.half).toBe('evening')
    expect(m.goldenStarts?.getTime()).toBe(t.goldenHour!.getTime())
    expect(m.twilightEdge?.getTime()).toBe(t.dusk!.getTime())
    /* Order a shooter can check against the sky: golden, sunset, dusk. */
    expect(t.goldenHour!.getTime()).toBeLessThan(t.sunset!.getTime())
    expect(t.sunset!.getTime()).toBeLessThan(t.dusk!.getTime())
  })

  it('writes three events, each with an alarm at its own start', () => {
    const text = shootDayIcs(evening)
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(text.match(/BEGIN:VALARM/g)).toHaveLength(3)
    expect(text).toContain('SUMMARY:Golden hour starts')
    expect(text).toContain('SUMMARY:Civil twilight ends: strobe')
    expect(text).toContain('107.29')
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('a morning shoot gets sunrise and civil dawn instead', () => {
    const morning = { ...evening, start: new Date('2026-10-25T10:30:00Z'), end: new Date('2026-10-25T12:00:00Z') }
    const t = getTimes(new Date('2026-10-25T11:15:00Z'), evening.lat, evening.lon)
    const m = shootMoments(morning)
    expect(m.half).toBe('morning')
    expect(m.goldenStarts?.getTime()).toBe(t.sunrise!.getTime())
    expect(m.twilightEdge?.getTime()).toBe(t.dawn!.getTime())
  })
})

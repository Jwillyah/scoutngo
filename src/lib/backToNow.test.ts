import { describe, expect, it } from 'vitest'
import { backToNow } from './backToNow.ts'
import { resolveWindow, type VenueDraft } from './venue.ts'

const venue = (date: string): VenueDraft =>
  ({
    name: null,
    latitude: '38.3607',
    longitude: '-75.6036',
    date,
    startTime: '11:00',
    endTime: '15:00',
    eventDescription: '',
    desiredOutcome: '',
  }) as VenueDraft

describe('back to now', () => {
  it('on the shoot day, moves the bar to this minute and leaves the date', () => {
    const v = venue('2026-09-12')
    const now = new Date('2026-09-12T17:30:00Z') /* 1:30 PM EDT */
    const got = backToNow(v, now)
    expect(got?.date).toBeNull()
    const w = resolveWindow(v)
    expect(w).not.toBeNull()
    if (w === null || got === null) return
    expect(new Date(w.start.getTime() + (w.end.getTime() - w.start.getTime()) * got.scrub).toISOString()).toBe(now.toISOString())
  })

  it('on another day, changes the date to today at the venue, then moves to now', () => {
    const now = new Date('2026-10-26T23:10:00Z') /* 7:10 PM EDT, Oct 26 */
    const got = backToNow(venue('2026-09-12'), now)
    expect(got?.date).toBe('2026-10-26')
    const w = resolveWindow(venue('2026-10-26'))
    if (w === null || got === null) throw new Error('no window')
    expect(w.start.getTime() + (w.end.getTime() - w.start.getTime()) * got.scrub).toBe(now.getTime())
  })

  it('uses the venue calendar, not UTC: 1 AM UTC on the 27th is still the 26th in Maryland', () => {
    expect(backToNow(venue('2026-10-26'), new Date('2026-10-27T01:00:00Z'))?.date).toBeNull()
  })
})

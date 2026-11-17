import { describe, expect, it } from 'vitest'
import { backToNow, RESUME_NOW_MS, resumeGoesToNow } from './backToNow.ts'
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

/*
 * Batch FIX, Section 2.1 (phone, 17 Nov 7:05 AM): the map opened at "Tue 2 PM".
 * The home-screen app was resumed, not launched: the bar sat where it was left
 * the night before, and nothing on a resume moved it. A launch and leaving the
 * home already went to now; a resume did not.
 */
describe('coming back to the app is now', () => {
  const vb = { ...venue('2026-11-16'), latitude: '36.8435', longitude: '-75.9713', startTime: '15:00', endTime: '19:00' } as VenueDraft
  const at = (v: VenueDraft, scrub: number) => {
    const w = resolveWindow(v)
    if (w === null) throw new Error('no window')
    return new Date(w.start.getTime() + (w.end.getTime() - w.start.getTime()) * scrub)
  }
  /* Monday's 3-7 PM window; the bar dragged on to Tuesday 2 PM (23 h past the start, 5.75 windows). */
  const left = 5.75
  const hidden = new Date('2026-11-17T04:30:00Z').getTime() /* Mon 11:30 PM EST */
  const shown = new Date('2026-11-17T12:05:00Z') /* Tue 7:05 AM EST */

  it('the field case, before: the kept bar reads Tue 2 PM at 7:05 AM', () => {
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric' }).format(at(vb, left))).toBe('Tue 2 PM')
  })

  it('after a night away the resume goes to now: Tuesday made the shoot day, the bar at 7:05 AM', () => {
    expect(resumeGoesToNow(hidden, shown.getTime())).toBe(true)
    const got = backToNow(vb, shown)
    expect(got?.date).toBe('2026-11-17')
    if (got === null || got.date === null) throw new Error('no answer')
    expect(at({ ...vb, date: got.date }, got.scrub).toISOString()).toBe(shown.toISOString())
  })

  it('a glance at a message and back keeps the hour being read', () => {
    expect(resumeGoesToNow(shown.getTime() - RESUME_NOW_MS + 1000, shown.getTime())).toBe(false)
    expect(resumeGoesToNow(shown.getTime() - RESUME_NOW_MS, shown.getTime())).toBe(true)
    expect(resumeGoesToNow(null, shown.getTime())).toBe(false)
  })
})

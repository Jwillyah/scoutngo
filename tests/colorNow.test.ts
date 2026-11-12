import { describe, expect, it } from 'vitest'
import type { CallRead } from '../src/core/briefing.ts'
import { colorNowLine, compass8 } from '../src/core/colorNow.ts'

/* Batch TRUTH, Section 0.5: the open app says when the colour is on. 12 Nov sunrise at the pier, 6:39 AM EST. */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const event = new Date('2026-11-12T11:39:06Z')
const read = (call: CallRead['call']): CallRead => ({ kind: 'sunrise', event, call, why: '', confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 2, of: 5 })
const at = (min: number) => new Date(event.getTime() + min * 60_000)

describe('"Color now" on the home', () => {
  it('a Maybe or a Go inside T-30 min to T+20 min', () => {
    expect(colorNowLine([read('Maybe'), null], at(-10), PIER, 'America/New_York')).toBe('Color now · sunrise 6:39 AM · look E')
    expect(colorNowLine([read('Go')], at(-30), PIER, 'America/New_York')).not.toBeNull()
    expect(colorNowLine([read('Go')], at(20), PIER, 'America/New_York')).not.toBeNull()
  })
  it('nothing outside the window, for a Skip, or with no call', () => {
    expect(colorNowLine([read('Go')], at(-31), PIER, 'America/New_York')).toBeNull()
    expect(colorNowLine([read('Go')], at(21), PIER, 'America/New_York')).toBeNull()
    expect(colorNowLine([read('Skip')], at(0), PIER, 'America/New_York')).toBeNull()
    expect(colorNowLine([read(null)], at(0), PIER, 'America/New_York')).toBeNull()
  })
  it('eight compass points', () => {
    expect(compass8(111.7)).toBe('E')
    expect(compass8(250)).toBe('W')
    expect(compass8(-10)).toBe('N')
  })
  it('the home renders it, and it opens the Sky page', async () => {
    const { readFileSync } = await import('node:fs')
    const home = readFileSync('src/components/Home.tsx', 'utf8')
    expect(home).toMatch(/className="hwx__date hday__colornow"[^>]*onClick=\{\(\) => onOpen\('sky'\)\}/)
  })
})

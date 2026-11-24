import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SurfBars } from './SurfTapIn.tsx'
import { cleanMoment } from '../core/homeTiles.ts'
import { formatShortHour } from '../core/timezone.ts'
import type { RangeHour } from '../lib/surfPageData.ts'
import { daylightAt, stretchWords, surfBars, surfRuns, surfWindow, windowHour } from '../lib/surfTapIn.ts'
import { callOf } from '../lib/useSurfNow.ts'

/*
 * BATCH SIMPLE-3, SECTION 0.3: ONE SURF STORY. 23 Nov 11:07 AM at Atlantic
 * Park Surf: the home's card "1–3 ft until 5 PM" (the glassy rule over the
 * briefing's wind, the size from the band's rounded ends), the Surf tile
 * "2–3 ft" (the call), the Surf chart "clean 10a–11p" (every clean hour, day
 * or night, any size) and its Best row "11a–11p" (clean hours not yet over,
 * 1 ft and up). Now all four read the one series and the one window
 * (src/lib/surfTapIn.ts surfRuns, surfWindow, windowHour): here, a day shaped
 * like that one, clean from 10 AM to 11 PM at 2-3 ft, sunset 4:50 PM. That
 * the Surf page and the home read these, and nothing else, is held by
 * tests/oneSurfStory.test.ts.
 */
const TZ = 'America/New_York'
const SPOT = { lat: 36.851, lon: -75.98 }
const now = new Date('2026-11-23T16:07:00Z') /* 11:07 AM */
const daylight = daylightAt(SPOT)

/** The one series' hours, each at half past, from 9:30 AM to 9:30 AM next day: clean from 10 AM to 11 PM (the field's day). */
const series: RangeHour[] = Array.from({ length: 25 }, (_, k) => {
  const at = new Date(Date.parse('2026-11-23T14:30:00Z') + k * 3_600_000)
  const local = (at.getUTCHours() + 24 - 5) % 24
  const clean = k >= 1 && k <= 13
  const centerFt = 2.4 + 0.2 * Math.sin(k / 3)
  return {
    at,
    forecastFt: centerFt,
    range: { lowFt: 1.4, centerFt, highFt: 3.2 },
    leanFt: 0,
    centerFt,
    spreadFt: 0.9,
    periodS: 10,
    fromDeg: 95,
    shape: clean ? 'Clean' : 'Messy',
    side: clean ? 'Offshore' : 'Onshore',
    clean,
    tag: 'Fun',
    windKt: clean ? 3 : 12,
    chop: false,
    quality: null,
    windSeaDominant: false,
    _local: local,
  } as unknown as RangeHour
})

describe('one surf story: the home card, the Surf tile, the chart\'s lit stretch and the Best row', () => {
  const w = surfWindow(series, now, daylight)
  it('the window exists in this day (a check that looked at nothing would pass)', () => {
    expect(w).not.toBeNull()
    expect(surfRuns(series, daylight).length).toBeGreaterThan(0)
  })
  const words = w === null ? 'none' : stretchWords(w, now, TZ)

  it('one window: clean from 10 AM to the last daylight hour, never into the dark', () => {
    expect(words).toBe('10a–5p')
  })

  it('the chart lights that stretch and says it in the same words', () => {
    const { from, to, bars } = surfBars(series, now)
    const html = renderToStaticMarkup(createElement(SurfBars, { bars, from, to, now, timeZone: TZ, runs: surfRuns(series, daylight) }))
    const labels = [...html.matchAll(/class="sbars__bandt"[^>]*>([^<]+)</g)].map((m) => m[1])
    expect(labels).toEqual([`clean ${words}`])
    expect(html).not.toMatch(/clean 10a–11p/)
  })

  it('the home card: the same window and, while it is on, the Surf tile\'s own size', () => {
    expect(w).not.toBeNull()
    if (w === null) return
    const hour = windowHour(series, w, now)
    const tile = callOf(series.find((h) => h.at.getTime() === Date.parse('2026-11-23T16:30:00Z')) ?? null, 0)?.words
    const card = cleanMoment({ from: w.from, to: w.to, words, size: callOf(hour, 0)?.words ?? null }, now, TZ)
    expect(card?.eyebrow).toBe(`Clean now · until ${formatShortHour(w.to, TZ) === '5p' ? '5 PM' : '?'}`)
    expect(card?.line).toBe(tile)
    expect(card?.until?.getTime()).toBe(w.to.getTime())
    /* Later, before it starts: "Clean · 10a–5p", the Best row's words. */
    const early = new Date('2026-11-23T12:00:00Z')
    const w2 = surfWindow(series, early, daylight)
    expect(cleanMoment(w2 === null ? null : { from: w2.from, to: w2.to, words: stretchWords(w2, early, TZ), size: null }, early, TZ)?.eyebrow).toBe('Clean · 10a–5p')
  })

  it('the card ends with its window', () => {
    if (w === null) return
    expect(cleanMoment({ from: w.from, to: w.to, words, size: null }, new Date(w.to.getTime() + 60_000), TZ)).toBeNull()
  })
})

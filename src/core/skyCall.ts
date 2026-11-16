/*
 * ONE SKY CALL PER SPOT PER EVENT (Batch CORE, Section 1.1 and 1.3).
 *
 * On 15 Nov at 4:59 PM a whole-sky deck was lit red-pink over inland VB and
 * every surface had already moved on: the Sky page's Next said "Sunrise 6:43
 * AM", its tabs "Tomorrow morning · Tomorrow evening", the home card the
 * sunrise. Each picked "the next event" its own way, and each dropped the
 * sunset the second the sun went down, while its colour was peaking.
 *
 * This is the one place that says which event is the sky's now, and what is
 * said about it: the word, where to look, the window. An event stays the
 * current one until its colour is over: the call's own window end, or
 * EVENT_LINGER_MS after the event, whichever is later. The home card, the
 * "Color now" pill, the Sky page's Next and tabs, and the Go alert read it
 * (tests/skyCall.test.ts holds them to it).
 */
import { getPosition } from 'suncalc'
import type { CallRead } from './briefing.ts'
import { colorWords } from './homeDay.ts'

/** The colour goes on this long after a sunset (or a sunrise): the pill's own 20 min (src/core/colorNow.ts). */
export const EVENT_LINGER_MS = 20 * 60_000

type Kind = 'sunrise' | 'sunset'

export interface SkyDayIn {
  events: Record<Kind, Date | null>
  reads: Record<Kind, CallRead | null>
}

export interface SkyCall {
  kind: Kind
  event: Date
  read: CallRead | null
  call: CallRead['call']
  /** "color likely", "color possible", "color unlikely"; null with no call. */
  word: string | null
  /** The colour's window, when the call has one. */
  from: Date | null
  to: Date | null
  /** Where the sun is at the event, and where the call says to look (the pink's way when that is the colour). */
  sunDeg: number
  lookDeg: number
  /** Which day of `days` it is on. */
  dayIndex: number
}

/** When an event's colour is over: its window's end, or EVENT_LINGER_MS after it, whichever is later. */
export function colourOver(event: Date, read: CallRead | null): Date {
  const linger = event.getTime() + EVENT_LINGER_MS
  const to = read?.colorTo?.getTime() ?? 0
  return new Date(Math.max(linger, to))
}

/** The event the sky is about now: the earliest whose colour is not over. */
export function skyCallNow(days: readonly SkyDayIn[], now: Date, venue: { lat: number; lon: number }, only: Kind | null = null): SkyCall | null {
  let best: SkyCall | null = null
  days.forEach((d, dayIndex) => {
    for (const kind of ['sunrise', 'sunset'] as const) {
      if (only !== null && kind !== only) continue
      const event = d.events[kind]
      if (event === null) continue
      const read = d.reads[kind]
      if (colourOver(event, read).getTime() <= now.getTime()) continue
      if (best !== null && best.event.getTime() <= event.getTime()) continue
      const sunDeg = getPosition(event, venue.lat, venue.lon).azimuth
      best = { kind, event, read, call: read?.call ?? null, word: colorWords(read?.call ?? null), from: read?.colorFrom ?? null, to: read?.colorTo ?? null, sunDeg, lookDeg: read?.lookDeg ?? sunDeg, dayIndex }
    }
  })
  return best
}

/** Whether `now` is inside the call's colour: from its window's start (or the event) until the colour is over. */
export function colourLive(c: SkyCall, now: Date): boolean {
  const from = c.from ?? c.event
  return now.getTime() >= from.getTime() && now.getTime() <= colourOver(c.event, c.read).getTime()
}

const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const
const point16 = (deg: number) => POINTS16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

/**
 * The Now headline's line while the colour is on (Batch CORE, Section 1.3):
 * "whole sky · look WSW then overhead" under a broken or overcast deck the
 * station reports, else "look WSW". Null outside the colour or without a
 * Maybe or a Go.
 */
export function colourNowWords(c: SkyCall | null, now: Date, deckOverhead: boolean): string | null {
  if (c === null || (c.call !== 'Go' && c.call !== 'Maybe') || !colourLive(c, now)) return null
  const look = point16(c.lookDeg)
  return deckOverhead ? `whole sky · look ${look} then overhead` : `look ${look}`
}

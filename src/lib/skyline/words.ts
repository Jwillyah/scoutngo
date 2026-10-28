/*
 * THE SKYLINE IN WORDS: one line per time the sun (or the moon) goes behind
 * something or comes out from it, the sun's set against sunset.
 *
 *   "Sun drops behind the Hilton at 5:42 PM, 32 min before sunset."
 *   "Sun comes out from behind trees at 8:10 AM."
 *
 * Nothing standing in its way all day is said as that, about the sun only:
 * "Nothing the scan measured stands in front of the sun today from here."
 * It is never a word about anything else in the area.
 */
import { formatClock } from '../../core/timezone.ts'
import type { SkyEvent } from './skylineFor.ts'

export function eventLine(e: SkyEvent, sunset: Date | null, timeZone: string): string {
  const Body = e.body === 'sun' ? 'Sun' : 'Moon'
  const time = formatClock(e.at, timeZone)
  if (e.kind === 'shows') return `${Body} comes out from behind ${e.what} at ${time}.`
  if (e.body === 'sun' && sunset !== null && sunset.getTime() > e.at.getTime()) {
    const min = Math.round((sunset.getTime() - e.at.getTime()) / 60_000)
    return `${Body} drops behind ${e.what} at ${time}, ${min} min before sunset.`
  }
  return `${Body} goes behind ${e.what} at ${time}.`
}

/** The sun's lines first, then the moon's, each in time order. */
export function skylineLines(events: readonly SkyEvent[], sunset: Date | null, timeZone: string): string[] {
  const sun = events.filter((e) => e.body === 'sun')
  const moon = events.filter((e) => e.body === 'moon')
  const lines = sun.map((e) => eventLine(e, sunset, timeZone))
  if (sun.length === 0) lines.push('Nothing the scan measured stands in front of the sun today from here.')
  return [...lines, ...moon.map((e) => eventLine(e, sunset, timeZone))]
}

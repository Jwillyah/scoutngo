/*
 * WHERE'S THE COLOR? THE PAGE'S WORDS (Batch BEST SKY, Sections 3-5): the
 * radius, a window of time, what the grid says in a line.
 */
import type { RadiusMi, RankedSpot } from './bestSky.ts'
import { formatClock } from './timezone.ts'

export const radiusWords = (r: RadiusMi, miles: boolean): string => (miles ? `${r} mi` : `${Math.round(r * 1.609344)} km`)

/** "4:51 PM–5:13 PM": a window, each end with its AM or PM (or on the 24 hour clock), as every time on screen. */
export const clockSpan = (from: Date, to: Date, timeZone: string): string => `${formatClock(from, timeZone)}–${formatClock(to, timeZone)}`

/** "cloud over Lynnhaven Inlet and 3 more · clear elsewhere": what the grid says, in a line. */
export function gridSummary(ranked: readonly RankedSpot[]): string {
  const lit = ranked.filter((r) => r.why[0] === 'patch overhead')
  const clear = ranked.filter((r) => r.why[0] === 'clear sky')
  if (ranked.length === 0) return ''
  if (lit.length === 0) return clear.length === ranked.length ? 'clear everywhere in reach' : 'no patch overhead anywhere in reach'
  return `cloud over ${lit[0].spot.name}${lit.length > 1 ? ` and ${lit.length - 1} more` : ''}${clear.length > 0 ? ' · clear elsewhere' : ''}`
}

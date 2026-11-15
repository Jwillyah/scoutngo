/*
 * "COLOR NOW" (Batch TRUTH, Section 0.5). On 12 Nov the sunrise fired and
 * nothing on the open app said so. While the app is open in a live colour
 * window, from COLOR_NOW_BEFORE_MS before a sunrise or sunset to
 * COLOR_NOW_AFTER_MS after it, and the call for it is Maybe or better, the
 * home leads with one line: "Color now · sunrise 6:40 AM · look E". The call is
 * the briefing's (src/core/briefing.ts eventCall); the direction is the sun's
 * at the event. Code decides; no model.
 */
import { getPosition } from 'suncalc'
import type { CallRead } from './briefing.ts'
import { formatClock } from './timezone.ts'

export const COLOR_NOW_BEFORE_MS = 30 * 60_000
export const COLOR_NOW_AFTER_MS = 20 * 60_000
/**
 * Batch LIVE, Section 10.6: on 14 Nov the pill said "Color now" at 4:39 PM, sixteen minutes before the sunset. For a
 * sunset, "Color now" only from the colour window's start (the call's colorFrom; without one, the 6 min Best Sky's window
 * opens on, src/lib/useBestSky.ts nextColorEvent); earlier it says when, and both ways to look: "Color from 4:49 PM · look WSW + ENE" (the sun's side
 * and the pink's).
 */
export const SUNSET_NOW_BEFORE_MS = 6 * 60_000

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const
export const compass16 = (deg: number): (typeof POINTS16)[number] => POINTS16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
export const compass8 = (deg: number): (typeof POINTS)[number] => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]

/** `best`: the best spot near, when it beats here (Batch BEST SKY, Section 6): "Lynnhaven 6 mi NW". */
export function colorNowLine(reads: readonly (CallRead | null)[], now: Date, venue: { lat: number; lon: number }, timeZone: string, best: string | null = null): string | null {
  const live = reads.find(
    (r): r is CallRead =>
      r !== null && (r.call === 'Go' || r.call === 'Maybe') && now.getTime() >= r.event.getTime() - COLOR_NOW_BEFORE_MS && now.getTime() <= r.event.getTime() + COLOR_NOW_AFTER_MS,
  )
  if (live === undefined) return null
  /* With its AM or PM, as every time on screen (scripts/audit-clock.mjs; on 12 Nov the gate's run fell in the sunset window and read "sunset 4:52" bare). */
  const clock = formatClock(live.event, timeZone)
  /* The call's own colour window when it has one, the one Sky Tonight's bar and the home's "Next: sky color from" say; so no two surfaces name two starts. */
  const start = live.colorFrom ?? new Date(live.event.getTime() - SUNSET_NOW_BEFORE_MS)
  if (live.kind === 'sunset' && now.getTime() < start.getTime()) {
    const sun = getPosition(live.event, venue.lat, venue.lon).azimuth
    const from = formatClock(start, timeZone)
    return `Color from ${from} · look ${compass16(sun)} + ${compass16(sun + 180)}${best === null ? '' : ` · best ${best}`}`
  }
  /* The opposite sky's pink looks away from the sun (Batch NOW, Section 0). */
  const look = live.lookDeg ?? getPosition(live.event, venue.lat, venue.lon).azimuth
  return `Color now · ${live.kind} ${clock} · look ${compass8(look)}${best === null ? '' : ` · best ${best}`}`
}

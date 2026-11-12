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

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
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
  return `Color now · ${live.kind} ${clock} · look ${compass8(getPosition(live.event, venue.lat, venue.lon).azimuth)}${best === null ? '' : ` · best ${best}`}`
}

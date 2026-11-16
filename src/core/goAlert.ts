/*
 * THE GO ALERT (Batch CORE, Section 1.4). When the one sky call (src/core/
 * skyCall.ts) reaches Likely inside GO_ALERT_WITHIN_MS of the event and the
 * colour is not over, the phone says so once: "Go now · color likely ·
 * 4:44–5:10 · look WSW". Local only, opt-in (Settings), nothing leaves the
 * phone. On 15 Nov nothing fired because no build has ever had an alert.
 *
 * A web app can show a notification only while it runs (or just after it
 * goes to the background), and on iPhone only from the home-screen app. One
 * that wakes a closed app needs Web Push, a server that knows the spot and
 * the time: not done, by the privacy rule.
 */
import { colourOver, type SkyCall } from './skyCall.ts'
import { formatClock } from './timezone.ts'

export const GO_ALERT_WITHIN_MS = 45 * 60_000

const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const
const point16 = (deg: number) => POINTS16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

/** The event's key, so an alert is said once. */
export const goAlertKey = (c: SkyCall): string => `${c.kind}-${c.event.getTime()}`

/** The alert's words when one is due now, else null. */
export function goAlertDue(c: SkyCall | null, now: Date, sent: readonly string[], timeZone: string): string | null {
  if (c === null || c.call !== 'Go') return null
  if (c.event.getTime() - now.getTime() > GO_ALERT_WITHIN_MS) return null
  if (now.getTime() > colourOver(c.event, c.read).getTime()) return null
  if (sent.includes(goAlertKey(c))) return null
  const from = c.from ?? c.event
  const to = c.to ?? colourOver(c.event, c.read)
  return `Go now · color likely · ${formatClock(from, timeZone)}–${formatClock(to, timeZone)} · look ${point16(c.lookDeg)}`
}

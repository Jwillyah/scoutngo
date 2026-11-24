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
import { moonGoAlert, type MoonHomeMoment } from './moonMoment.ts'
import type { RainNow } from './rainNow.ts'
import { colourOver, type SkyCall } from './skyCall.ts'
import { formatClock } from './timezone.ts'

export const GO_ALERT_WITHIN_MS = 45 * 60_000

const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const
const point16 = (deg: number) => POINTS16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

/** The event's key, so an alert is said once. */
export const goAlertKey = (c: SkyCall): string => `${c.kind}-${c.event.getTime()}`

/*
 * LEAD TIME (Batch SIMPLE-3, Section 6.1). 21 Nov: the window read "6:20-6:30"
 * and the push came at 6:52, after it had ended: the guard was the event's
 * linger (colourOver), not the window the words printed. Now the window is
 * the one the words say: from GO_ALERT_WITHIN_MS before its start (so the
 * phone, open, says it with at least GO_ALERT_MIN_LEAD_MS to spare whenever
 * it saw the call that early), and never once its end has passed. A call
 * first seen with less lead than that still says "Go now" while the window
 * lasts; after it, nothing.
 */
export const GO_ALERT_MIN_LEAD_MS = 15 * 60_000

/** The window the alert's words print: the call's own colour window, else the event to when its colour is over. */
export function goWindow(c: SkyCall): { from: Date; to: Date } {
  return { from: c.from ?? c.event, to: c.to ?? colourOver(c.event, c.read) }
}

/** When the alert becomes due: GO_ALERT_WITHIN_MS before the window starts. */
export const goAlertFrom = (c: SkyCall): Date => new Date(goWindow(c).from.getTime() - GO_ALERT_WITHIN_MS)

/** The alert's words when one is due now, else null. */
export function goAlertDue(c: SkyCall | null, now: Date, sent: readonly string[], timeZone: string): string | null {
  if (c === null || c.call !== 'Go') return null
  const { from, to } = goWindow(c)
  if (from.getTime() - now.getTime() > GO_ALERT_WITHIN_MS) return null
  if (now.getTime() >= to.getTime()) return null
  if (sent.includes(goAlertKey(c))) return null
  return `Go now · color likely · ${formatClock(from, timeZone)}–${formatClock(to, timeZone)} · look ${point16(c.lookDeg)}`
}

/* ------------------------------------------------------------ rain and moon */

/** One alert to say: its words, and the key it is kept under so it is said once. */
export interface AlertDue {
  key: string
  text: string
}

/** Rain starting or ending within this long: the alert's window (Section 1b.3). */
export const RAIN_ALERT_WITHIN_MS = 30 * 60_000
const HOUR_MS = 3_600_000
const FIVE_MIN_MS = 5 * 60_000

/**
 * The rain alert (Batch SIMPLE-3, Section 1b.3; the same switch as the Go
 * alert, on the phone only): "Rain starts ~20 min · light" when rain is
 * forecast to start within RAIN_ALERT_WITHIN_MS, "Rain ending ~11:50 PM" when
 * it is raining and the end is that near. A start with no known time says
 * nothing (rainNow gives none for a moving-unknown radar), and so does "nearby"
 * and "unknown": never a guess. Said once per hour of the start or end.
 */
export function rainAlertDue(r: RainNow | null, now: Date, sent: readonly string[], timeZone: string): AlertDue | null {
  if (r === null) return null
  if (r.state === 'starting' && r.startsAt !== null) {
    const ms = r.startsAt.getTime() - now.getTime()
    if (ms <= 0 || ms > RAIN_ALERT_WITHIN_MS) return null
    const key = `rain-start-${Math.floor(r.startsAt.getTime() / HOUR_MS)}`
    if (sent.includes(key)) return null
    const min = Math.max(5, Math.round(ms / FIVE_MIN_MS) * 5)
    return { key, text: `Rain starts ~${min} min${r.intensity === null ? '' : ` · ${r.intensity}`}` }
  }
  if (r.state === 'raining' && r.endsAt !== null) {
    const ms = r.endsAt.getTime() - now.getTime()
    if (ms <= 0 || ms > RAIN_ALERT_WITHIN_MS) return null
    const key = `rain-end-${Math.floor(r.endsAt.getTime() / HOUR_MS)}`
    if (sent.includes(key)) return null
    return { key, text: `Rain ending ${r.endsBy ? 'by ' : ''}~${formatClock(r.endsAt, timeZone)}` }
  }
  return null
}

/** The Supermoon alert (Section 2b.2; the same switch as color): MOON_ALERT_LEAD_MS before the rise, never after it, once per rise. */
export function moonAlertDue(m: MoonHomeMoment | null, now: Date, sent: readonly string[]): AlertDue | null {
  const a = moonGoAlert(m, now)
  if (a === null || now.getTime() < a.fireAt.getTime() || now.getTime() >= a.until.getTime() || sent.includes(a.key)) return null
  return { key: a.key, text: a.text }
}

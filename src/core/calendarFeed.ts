/*
 * THE SKY CALLS AS A CALENDAR FEED (Batch H, Sections 2.3 and 4). Opt-in.
 *
 * Apple Calendar (or any calendar app) subscribes to a URL that carries the
 * venue rounded to 2 decimals, about a kilometre, and asks it again on its
 * own schedule; so the calls in the calendar change by themselves as the
 * forecast does. One event per sunrise or sunset worth a look (Go or
 * Maybe) in the next FEED_DAYS days, from be set up to the end of the
 * colour, with an alarm at the Remind time (src/core/alertIcs.ts). The UID
 * is the event's day and kind, so a new answer replaces the old one rather
 * than adding a second. A Skip is left out: no alarm for nothing.
 *
 * The feed's server reads the models only, with no station: it never says
 * Go (src/core/briefing.ts), only Maybe, and says so in the event.
 */
import { remindAt } from './alertIcs.ts'
import type { CallRead } from './briefing.ts'
import { foldLine, icsStamp, icsText } from './ics.ts'

export const FEED_DAYS = 3
/** The coordinate as the feed takes it: exactly two decimals, nothing finer. */
export const FEED_COORD = /^-?\d{1,3}\.\d{2}$/

export function feedCoords(lat: string | null, lon: string | null): { lat: number; lon: number } | null {
  if (lat === null || lon === null || !FEED_COORD.test(lat) || !FEED_COORD.test(lon)) return null
  const a = Number(lat)
  const o = Number(lon)
  return Math.abs(a) <= 90 && Math.abs(o) <= 180 ? { lat: a, lon: o } : null
}

/** The path a phone subscribes to, venue rounded to 2 decimals. */
export function feedPath(lat: number, lon: number): string {
  return `/api/calendar?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`
}

const KIND = { sunrise: 'Sunrise', sunset: 'Sunset' } as const

export function feedIcs(reads: readonly CallRead[], at: { lat: number; lon: number }, stamp: Date): string {
  const events = reads
    .filter((r) => r.call === 'Go' || r.call === 'Maybe')
    .flatMap((r) => {
      const from = r.setUp ?? new Date(r.event.getTime() - 20 * 60_000)
      const to = r.colorTo ?? new Date(r.event.getTime() + 30 * 60_000)
      return [
        'BEGIN:VEVENT',
        `UID:${r.kind}-${r.event.toISOString().slice(0, 10)}-${at.lat.toFixed(2)},${at.lon.toFixed(2)}@scoutngo`,
        `DTSTAMP:${icsStamp(stamp)}`,
        `DTSTART:${icsStamp(from)}`,
        `DTEND:${icsStamp(to)}`,
        `SUMMARY:${icsText(`${KIND[r.kind]} ${r.call}`)}`,
        `DESCRIPTION:${icsText(`${r.why} From the forecast models only; open ScoutNGo for the stations' final call within the hour.`)}`,
        'BEGIN:VALARM',
        `TRIGGER;VALUE=DATE-TIME:${icsStamp(remindAt(r.event, r.setUp))}`,
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText(`${KIND[r.kind]} ${r.call}`)}`,
        'END:VALARM',
        'END:VEVENT',
      ]
    })
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoutNGo//Sky calls//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ScoutNGo sky calls',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events,
    'END:VCALENDAR',
  ]
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

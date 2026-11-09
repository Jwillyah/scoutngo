/*
 * THE DRONE LINE'S NEXT WINDOW (Batch M, Section 4).
 *
 * WHAT WAS WRONG. At 8 AM on 8 Nov the Today card's drone line said "No light
 * to fly for": with no call to time a launch by, it had nothing to say. It now
 * says the next calm stretch of daylight and the next golden light, worked out
 * here from what the card already holds:
 *
 *   calm     an hour whose wind at 400 ft (the forecast's 120 m) is under
 *            DRONE_LIGHT_RATIO of the aircraft's rating: droneTag's
 *            'Light wind', the same line the card's scale draws. A run of
 *            calm daylight hours is a window, "10 AM-1 PM". An hour with no
 *            400 ft wind is not calm: unknown is not a window.
 *   golden   suncalc's golden hour, the card's own Golden step
 *            (lightSteps): sunrise to the sun 6° up, or 6° up to sunset,
 *            whichever ends next.
 *
 * With no calm hour, the fact: the wind over the line, or that the forecast
 * does not say. Never what to do about it.
 */
import { getTimes } from 'suncalc'
import { DRONE_LIGHT_RATIO, type WindHourIn } from './briefing.ts'
import { formatClock } from './timezone.ts'

const HOUR = 3_600_000

export interface TimeSpan {
  from: Date
  to: Date
}

export type CalmRead =
  /** The next run of calm daylight hours. */
  | { kind: 'calm'; span: TimeSpan }
  /** Every daylight hour left is forecast at or over `overMps` at 400 ft; `allDay` when no daylight had passed yet. */
  | { kind: 'windy'; overMps: number; allDay: boolean }
  /** No calm hour known, and some hours the forecast does not give. */
  | { kind: 'unknown' }
  /** The aircraft has no wind rating: nothing to hold the wind against. */
  | { kind: 'no-rating' }
  /** No daylight left in this day. */
  | { kind: 'dark' }

export interface DroneWindow {
  calm: CalmRead
  golden: TimeSpan | null
}

const ok = (d: Date | null | undefined): Date | null => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null)

/**
 * The next calm window and golden light in one day. `dayStart` is the day's
 * local midnight, `wind` its hourly forecast, `limitMps` the aircraft's rating,
 * `now` the time it is asked at.
 */
export function droneWindow(wind: readonly WindHourIn[], limitMps: number | null, dayStart: Date, lat: number, lon: number, now: Date): DroneWindow {
  const t = getTimes(new Date(dayStart.getTime() + 12 * HOUR), lat, lon)
  const sunrise = ok(t.sunrise)
  const sunset = ok(t.sunset)

  /* Golden: the morning's if it has not ended, else the evening's. */
  const spans: TimeSpan[] = []
  const goldenEnd = ok(t.goldenHourEnd)
  const goldenStart = ok(t.goldenHour)
  if (sunrise !== null && goldenEnd !== null) spans.push({ from: sunrise, to: goldenEnd })
  if (goldenStart !== null && sunset !== null) spans.push({ from: goldenStart, to: sunset })
  const golden = spans.find((s) => s.to.getTime() > now.getTime()) ?? null

  const calm = calmRead(wind, limitMps, sunrise, sunset, now)
  return { calm, golden }
}

function calmRead(wind: readonly WindHourIn[], limitMps: number | null, sunrise: Date | null, sunset: Date | null, now: Date): CalmRead {
  if (sunrise === null || sunset === null || sunset.getTime() <= now.getTime()) return { kind: 'dark' }
  if (limitMps === null || limitMps <= 0) return { kind: 'no-rating' }
  const line = limitMps * DRONE_LIGHT_RATIO
  /* Daylight hours not yet over: the hour ends after now and after sunrise, and starts before sunset. */
  const hours = [...wind]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .filter((h) => h.at.getTime() + HOUR > Math.max(now.getTime(), sunrise.getTime()) && h.at.getTime() < sunset.getTime())
  if (hours.length === 0) return { kind: 'unknown' }
  let from: Date | null = null
  let to: Date | null = null
  for (const h of hours) {
    const calm = h.highMps !== null && h.highMps < line
    if (calm && from === null) from = h.at
    if (calm) to = new Date(Math.min(h.at.getTime() + HOUR, sunset.getTime()))
    if (!calm && from !== null) break
  }
  if (from !== null && to !== null) return { kind: 'calm', span: { from, to } }
  if (hours.some((h) => h.highMps === null)) return { kind: 'unknown' }
  return { kind: 'windy', overMps: line, allDay: now.getTime() <= sunrise.getTime() }
}

/**
 * The line in words: "Calm 10 AM–1 PM · golden 4:22–4:56". `speed` writes a
 * wind speed in the shooter's unit, rounded down so "over 11 kt" stays true.
 */
export function droneWindowLine(w: DroneWindow, timeZone: string, speed: (mps: number) => string): string {
  const short = (d: Date) => formatClock(d, timeZone).replace(/ [AP]M$/, '')
  /* "10 AM" on the hour, "4:56 PM" when sunset cuts the window short. */
  const hour = (d: Date) => formatClock(d, timeZone).replace(/:00 /, ' ')
  const golden = w.golden === null ? null : `golden ${short(w.golden.from)}–${short(w.golden.to)}`
  const c = w.calm
  const calm =
    c.kind === 'calm'
      ? `Calm ${hour(c.span.from)}–${hour(c.span.to)}`
      : c.kind === 'windy'
        ? `Wind over ${speed(c.overMps)} at 400 ft ${c.allDay ? 'all day' : 'rest of the day'}`
        : c.kind === 'unknown'
          ? 'Wind at 400 ft not forecast'
          : c.kind === 'dark'
            ? 'Sun down'
            : null
  const parts = [calm, golden].filter((p): p is string => p !== null)
  if (parts.length === 0) return '—'
  const line = parts.join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

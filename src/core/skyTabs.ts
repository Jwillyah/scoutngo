/*
 * WHICH SKY TAB THE PAGE OPENS ON (Batch SIMPLE-2, Section 4: "Now · Tonight ·
 * Tmrw AM · Night; opens on Tonight before sunset/sunrise, Now otherwise,
 * Night after dark"). Arithmetic on the venue's own day; the page only reads
 * the answer.
 *
 * THE RULE, on the venue's local day (sunrise, sunset and civil dusk from
 * suncalc at local noon, as src/core/moonNights.ts does):
 *
 *   before sunrise - MORNING_LEAD_MIN       night     the night still running
 *   until sunrise + NOW_AFTER_SUNRISE_MIN   tmrw-am   the morning's light and its call
 *   until sunset - NOW_BEFORE_SUNSET_MIN    now       the day's middle (src/core/skyNow.ts opensOnNow)
 *   until civil dusk (sun at -6°)           tonight   the evening's light and its call
 *   after civil dusk                        night     the moon and the dark
 *
 * The morning's lead is the evening's (90 minutes) so the two calls get the
 * same warning. A day with no sunrise or sunset (polar) opens on Now: there is
 * no event to lead up to and nothing here can say it is dark.
 */
import { getTimes } from 'suncalc'
import { localDate } from './moonTimes.ts'
import { NOW_AFTER_SUNRISE_MIN, NOW_BEFORE_SUNSET_MIN, opensOnNow } from './skyNow.ts'
import { zonedTimeToUtc } from './timezone.ts'

export type SkyTabId = 'now' | 'tonight' | 'tmrw-am' | 'night'

/** The tabs, in the order the pills show them (fixed: a swipe always goes the same way). */
export const SKY_TAB_IDS: readonly SkyTabId[] = ['now', 'tonight', 'tmrw-am', 'night']

/** The morning's tab opens this long before sunrise: the evening's lead, mirrored. */
export const MORNING_LEAD_MIN = NOW_BEFORE_SUNSET_MIN

const MIN = 60_000
const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

export interface SkyDayTimes {
  sunrise: Date | null
  sunset: Date | null
  /** Civil dusk, the sun 6° down after sunset. */
  dusk: Date | null
}

/** The venue's own day's sunrise, sunset and civil dusk (suncalc at local noon). */
export function skyDayTimes(now: Date, lat: number, lon: number, timeZone: string): SkyDayTimes {
  const noon = zonedTimeToUtc(localDate(now, timeZone), '12:00', timeZone)
  if (noon === null) return { sunrise: null, sunset: null, dusk: null }
  const t = getTimes(noon, lat, lon)
  return { sunrise: usable(t.sunrise) ? t.sunrise : null, sunset: usable(t.sunset) ? t.sunset : null, dusk: usable(t.dusk) ? t.dusk : null }
}

/** The tab the Sky page opens on at `now`, by THE RULE above. */
export function skyOpenTab(now: Date, day: SkyDayTimes): SkyTabId {
  const { sunrise, sunset, dusk } = day
  if (sunrise === null || sunset === null) return 'now'
  const t = now.getTime()
  if (t < sunrise.getTime() - MORNING_LEAD_MIN * MIN) return 'night'
  if (t < sunrise.getTime() + NOW_AFTER_SUNRISE_MIN * MIN) return 'tmrw-am'
  if (opensOnNow(now, sunrise, sunset)) return 'now'
  if (dusk === null || t < dusk.getTime()) return 'tonight'
  return 'night'
}

/**
 * The pill's word for an event's tab: "Tonight" / "This AM" when the event is
 * on today's date, "Tmrw PM" / "Tmrw AM" when tomorrow's, else the weekday
 * ("Fri PM"). Never a word for a day the event is not on.
 */
export function eventTabLabel(kind: 'sunset' | 'sunrise', event: Date | null, now: Date, timeZone: string): string {
  if (event === null) return kind === 'sunset' ? 'Tonight' : 'Tmrw AM'
  const d = localDate(event, timeZone)
  const today = localDate(now, timeZone)
  const tomorrow = localDate(new Date(now.getTime() + 24 * 60 * MIN), timeZone)
  const half = kind === 'sunset' ? 'PM' : 'AM'
  if (d === today) return kind === 'sunset' ? 'Tonight' : 'This AM'
  if (d === tomorrow) return `Tmrw ${half}`
  return `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(event)} ${half}`
}

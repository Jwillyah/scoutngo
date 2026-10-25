/*
 * IS IT WORTH PULLING OVER, AND HOW LONG HAVE I GOT.
 *
 * Every other screen in this app needs a pin, a date and a window before it
 * will say anything. That is right for planning a shoot a week out and useless
 * at the moment this is for: driving, the sky goes off, and the question has a
 * two second answer or no answer at all.
 *
 * So this takes a coordinate and an instant and returns the whole screen as
 * data. No window to enter, no date to pick, nothing to scrub.
 *
 * WHAT IT WILL NOT DO. It does not score the sky and it does not say whether
 * to go. It says what the sun is doing, when the peak band runs, and how long
 * is left. Whether that is worth a detour depends on what is standing in the
 * way, and this app cannot see that from here.
 */

import { durationWords } from './duration.ts'
import { compassWord } from './compassWords.ts'
import type { LatLon } from './geo.ts'
import { civilTimes } from './nightWindow.ts'
import { bandIntervals, peakIn, SET_UP_MARGIN_MINUTES } from './shootWindow.ts'
import { getSunPosition } from './sun.ts'

/**
 * WHICH MOMENT OF THE DAY THIS IS, as the thing the screen is about.
 *
 * Named rather than derived from a countdown's sign, because the screen says
 * something different in each and "minutes until sunset" is meaningless in
 * three of them.
 */
export type GlancePhase =
  /** Sunset is ahead and close enough to matter. */
  | 'sunset-soon'
  /** Sunset has happened and the twilight light is running now. */
  | 'twilight-now'
  /** Dark, with the next thing being tomorrow's sunrise. */
  | 'night'
  /** Sunrise is ahead and close. */
  | 'sunrise-soon'
  /** Broad daylight, hours either side. */
  | 'day'

/**
 * How close a sun event has to be before this screen leads with it.
 *
 * Ninety minutes. Past that the honest headline is the clock time rather than
 * a countdown: "sunset in 4 h 50" is a fact nobody pulls over for, and
 * dressing it up as urgent would make the countdown mean nothing when it is
 * real.
 */
export const SOON_MINUTES = 90

export interface NowGlance {
  phase: GlancePhase
  /** The event being counted to, or the one just passed. Null in daylight. */
  eventAt: Date | null
  /**
   * Whole minutes until eventAt. Negative once it has passed, null in
   * daylight and at night where there is nothing close to count to.
   */
  minutesTo: number | null
  /**
   * Where to look, as a word and as the bearing behind it.
   *
   * The bearing is carried so the planner and the numerals switch have it;
   * the screen shows the word. Null when the sun is nowhere near the horizon,
   * because "look west" at noon is not a direction, it is a shrug.
   */
  look: { word: string; bearing: number } | null
  /** The blue hour band, which is where the light concentrates. */
  peak: { from: Date; to: Date; beSetUpBy: Date } | null
  /**
   * When the usable light is gone: dusk in the evening, sunrise in the
   * morning. This is the "how long have I got" number.
   */
  endsAt: Date | null
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

const minutesBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / MINUTE_MS)

const usable = (at: Date | null): at is Date => at !== null && !Number.isNaN(at.getTime())

/**
 * The peak band around an event, found by walking the hours either side of it.
 *
 * TWO HOURS EITHER SIDE rather than the whole day, because the blue hour band
 * occurs twice a day and a whole-day walk would return the morning one for an
 * evening question. The window is wide enough to contain the band at any
 * latitude this app is usable at and narrow enough that it cannot reach the
 * other end of the day.
 */
function peakAround(at: Date, where: LatLon): NowGlance['peak'] {
  const from = new Date(at.getTime() - 2 * 3_600_000)
  const to = new Date(at.getTime() + 2 * 3_600_000)
  const intervals = bandIntervals(
    (when) => getSunPosition(when, where.lat, where.lon).altitude,
    from,
    to,
  )
  /*
   * 'sunset' and 'sunrise' nominate the same peak band, so either kind finds
   * it; the window above is what decides which of the day's two it is.
   */
  const found = peakIn('sunset', intervals)
  return found === null
    ? null
    : { from: found.from, to: found.to, beSetUpBy: found.beSetUpBy }
}

/**
 * THE WHOLE SCREEN, AS DATA.
 *
 * `now` is passed in rather than read from the clock so this is testable
 * against a fixed instant, which is the only way to test a countdown.
 */
export function nowGlance(where: LatLon, now: Date): NowGlance {
  const today = civilTimes(now, where.lat, where.lon)
  const bearingAt = (at: Date) => getSunPosition(at, where.lat, where.lon).azimuth

  /*
   * ORDERED BY TIME OF DAY, NOT BY EVENT.
   *
   * The first version asked "is sunset ahead?" first. At twenty minutes before
   * SUNRISE that is also true, so a pre-dawn glance fell into the daylight
   * branch and reported "Daylight" with the evening's peak window attached.
   * The day has four stretches and they are disjoint, so they are tested in
   * the order they occur.
   */
  const dusk = usable(today.dusk) ? today.dusk : null
  const look = (at: Date) => ({ word: compassWord(bearingAt(at)), bearing: bearingAt(at) })

  /* 1. Before this morning's sunrise. */
  if (usable(today.sunrise) && now.getTime() < today.sunrise.getTime()) {
    const minutes = minutesBetween(now, today.sunrise)
    return {
      phase: minutes <= SOON_MINUTES ? 'sunrise-soon' : 'night',
      eventAt: today.sunrise,
      minutesTo: minutes <= SOON_MINUTES ? minutes : null,
      look: look(today.sunrise),
      peak: peakAround(today.sunrise, where),
      endsAt: today.sunrise,
    }
  }

  /* 2. Daylight, with sunset ahead. */
  if (usable(today.sunset) && now.getTime() < today.sunset.getTime()) {
    const minutes = minutesBetween(now, today.sunset)
    return {
      phase: minutes <= SOON_MINUTES ? 'sunset-soon' : 'day',
      eventAt: today.sunset,
      minutesTo: minutes <= SOON_MINUTES ? minutes : null,
      look: look(today.sunset),
      peak: peakAround(today.sunset, where),
      endsAt: dusk,
    }
  }

  /* 3. The sun is under and the twilight light is running. */
  if (usable(today.sunset) && dusk !== null && now.getTime() < dusk.getTime()) {
    return {
      phase: 'twilight-now',
      eventAt: today.sunset,
      minutesTo: minutesBetween(now, today.sunset),
      look: look(today.sunset),
      peak: peakAround(today.sunset, where),
      endsAt: dusk,
    }
  }

  /* 4. Dark, so the next thing is tomorrow morning. */
  const tomorrow = civilTimes(new Date(now.getTime() + DAY_MS), where.lat, where.lon)
  if (usable(tomorrow.sunrise)) {
    const minutes = minutesBetween(now, tomorrow.sunrise)
    return {
      phase: minutes <= SOON_MINUTES ? 'sunrise-soon' : 'night',
      eventAt: tomorrow.sunrise,
      minutesTo: minutes <= SOON_MINUTES ? minutes : null,
      look: look(tomorrow.sunrise),
      peak: peakAround(tomorrow.sunrise, where),
      endsAt: tomorrow.sunrise,
    }
  }

  /*
   * No sunrise and no sunset in reach: a polar day or a polar night. There is
   * no event to count to and saying so is the answer.
   */
  return { phase: 'night', eventAt: null, minutesTo: null, look: null, peak: null, endsAt: null }
}

/**
 * THE HEADLINE, which is the one line that has to land in under two seconds.
 *
 * Minutes up to 90, then hours and minutes, because "in 95 min" is arithmetic
 * the reader has to do and "in 1 h 35" is not.
 */
export function glanceHeadline(glance: NowGlance): string {
  switch (glance.phase) {
    case 'sunset-soon':
      return `Sunset in ${spanWords(glance.minutesTo ?? 0)}`
    case 'sunrise-soon':
      return `Sunrise in ${spanWords(glance.minutesTo ?? 0)}`
    case 'twilight-now':
      /*
       * NOT A COUNTDOWN TO SOMETHING GONE. Once the sun is under, the number
       * that matters is how long the light lasts, not how long ago it set.
       */
      return 'Twilight now'
    case 'night':
      return 'Night'
    case 'day':
      return 'Daylight'
  }
}

/** Whole minutes as something readable at a glance: "1 h 16 m", never "76 min". */
export function spanWords(minutes: number): string {
  return durationWords(minutes)
}

/**
 * HOW LONG IS LEFT, as a sentence or null.
 *
 * Null rather than a zero when there is nothing to say. A "0 min left" on this
 * screen would be read as urgency when it means the opposite.
 */
export function timeLeftWords(glance: NowGlance, now: Date): string | null {
  if (glance.endsAt === null) return null
  const minutes = minutesBetween(now, glance.endsAt)
  if (minutes <= 0) return null
  if (glance.phase === 'twilight-now') return `Light for about ${spanWords(minutes)} more.`
  if (glance.phase === 'sunset-soon') return `Usable light until ${spanWords(minutes)} from now.`
  return null
}

/** Minutes of setup margin, re-exported so the screen and the planner agree. */
export { SET_UP_MARGIN_MINUTES }
